use crate::state::{AUTHENTICATED_CACHE_TYPES, CachedEntry, ModrinthCredentials};
use crate::util::fetch::fetch_json;
use reqwest::Method;

#[tracing::instrument]
pub fn authenticate_begin_flow() -> &'static str {
    crate::state::get_login_url()
}

#[tracing::instrument]
pub async fn authenticate_finish_flow(
    code: &str,
) -> crate::Result<ModrinthCredentials> {
    let state = crate::State::get().await?;

    let creds = crate::state::finish_login_flow(
        code,
        &state.api_semaphore,
        &state.pool,
    )
    .await?;

    creds.upsert(&state.pool).await?;

    // Signing in deactivates any other account without removing it, so this is
    // the one identity change that doesn't go through `remove`. Drop the cached
    // data the previous session was allowed to see before this one reads it.
    CachedEntry::purge_cache_types(AUTHENTICATED_CACHE_TYPES, &state.pool)
        .await?;

    state
        .friends_socket
        .connect(&state.pool, &state.api_semaphore, &state.process_manager)
        .await?;

    Ok(creds)
}

#[tracing::instrument]
pub async fn logout() -> crate::Result<()> {
    let state = crate::State::get().await?;
    let current = ModrinthCredentials::get_active(&state.pool).await?;

    if let Some(current) = current {
        // Removing the credentials also purges the cached data they gave
        // access to.
        ModrinthCredentials::remove(&current.user_id, &state.pool).await?;
        state.friends_socket.disconnect().await?;
    }

    Ok(())
}

/// Fetches every project the signed-in user has access to (their personal
/// projects plus every project owned by an organization they belong to),
/// including non-public statuses such as unlisted and private.
///
/// Returns `None` when no user is signed in. The result is fetched fresh on
/// each call rather than cached, so it always reflects the currently active
/// credentials instead of a response captured under a different auth state.
#[tracing::instrument]
pub async fn get_user_projects() -> crate::Result<Option<serde_json::Value>> {
    let state = crate::State::get().await?;

    let Some(creds) =
        ModrinthCredentials::get_and_refresh(&state.pool, &state.api_semaphore)
            .await?
    else {
        return Ok(None);
    };

    let url = format!(
        "{}user/{}/all-projects",
        env!("MODRINTH_API_URL_V3"),
        creds.user_id
    );

    let projects = fetch_json(
        Method::GET,
        &url,
        None,
        None,
        Some("/v3/user/all-projects"),
        &state.api_semaphore,
        &state.pool,
    )
    .await?;

    Ok(Some(projects))
}

#[tracing::instrument]
pub async fn get_credentials() -> crate::Result<Option<ModrinthCredentials>> {
    let state = crate::State::get().await?;
    let current =
        ModrinthCredentials::get_and_refresh(&state.pool, &state.api_semaphore)
            .await?;

    Ok(current)
}
