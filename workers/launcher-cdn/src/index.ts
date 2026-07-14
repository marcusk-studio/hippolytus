interface Env {
	LAUNCHER_BUCKET: R2Bucket;
	MANIFEST_CACHE_CONTROL?: string;
	BLOB_CACHE_CONTROL?: string;
}

// The Tauri updater in every shipped launcher fetches this object from the
// route root; it is rewritten on each release so it must short-cache.
const MANIFEST_KEY = "update-manifest.json";

const DEFAULT_MANIFEST_CACHE = "public, max-age=30, must-revalidate";
const DEFAULT_BLOB_CACHE = "public, max-age=31536000, immutable";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

function textResponse(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

/**
 * Map a request path to an R2 object key.
 *
 * Every launcher artifact is served verbatim from the R2 bucket: the release
 * pipeline uploads `update-manifest.json` to the bucket root and the platform
 * bundles under `releases/<version>/…` (see release-build.yml). The manifest
 * URL-encodes spaces in filenames (`MARCUSK%20Launcher.app.tar.gz`), so each
 * segment is decoded to recover the exact key. Malformed percent-sequences and
 * paths escaping the bucket are rejected (so they 404 rather than throw).
 */
function objectKey(pathname: string): string | null {
	let segments: string[];
	try {
		segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
	} catch {
		return null;
	}
	if (segments.length === 0) {
		return null;
	}
	for (const segment of segments) {
		if (!segment || segment.includes("..") || segment.includes("/")) {
			return null;
		}
	}
	return segments.join("/");
}

function cacheControlFor(env: Env, key: string): string {
	if (key === MANIFEST_KEY) {
		return env.MANIFEST_CACHE_CONTROL?.trim() || DEFAULT_MANIFEST_CACHE;
	}
	return env.BLOB_CACHE_CONTROL?.trim() || DEFAULT_BLOB_CACHE;
}

function fallbackContentType(key: string): string {
	return key === MANIFEST_KEY
		? "application/json; charset=utf-8"
		: "application/octet-stream";
}

function buildObjectResponse(
	object: R2ObjectBody,
	key: string,
	cacheControl: string,
): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", cacheControl);
	if (!headers.has("content-type")) {
		headers.set("content-type", fallbackContentType(key));
	}

	return new Response(object.body, { headers });
}

function buildHeadResponse(
	object: R2Object,
	key: string,
	cacheControl: string,
): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", cacheControl);
	if (!headers.has("content-type")) {
		headers.set("content-type", fallbackContentType(key));
	}
	if (object.size !== undefined) {
		headers.set("content-length", String(object.size));
	}

	return new Response(null, { status: 200, headers });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== "GET" && request.method !== "HEAD") {
			return textResponse("Method Not Allowed", 405);
		}

		if (url.pathname === "/healthz") {
			return jsonResponse({ ok: true });
		}

		const key = objectKey(url.pathname);
		if (!key) {
			return textResponse("Not Found", 404);
		}

		const cacheControl = cacheControlFor(env, key);

		if (request.method === "HEAD") {
			const head = await env.LAUNCHER_BUCKET.head(key);
			if (!head) {
				return textResponse("Not Found", 404);
			}
			return buildHeadResponse(head, key, cacheControl);
		}

		const object = await env.LAUNCHER_BUCKET.get(key);
		if (!object) {
			return textResponse("Not Found", 404);
		}
		return buildObjectResponse(object, key, cacheControl);
	},
} satisfies ExportedHandler<Env>;
