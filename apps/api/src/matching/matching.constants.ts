export const SHARED_MAX_SEATS = Number(process.env.SHARED_MAX_SEATS ?? 4);
/** New rider's pickup must be within this distance of an existing (not yet visited) stop. */
export const PICKUP_CLUSTER_METERS = 3000;
export const DROPOFF_CLUSTER_METERS = 3000;
/** Shared riders pay this fraction of the private fare for their own direct distance. */
export const SHARED_DISCOUNT = 0.75;
/** Extra route length a new rider may add to an existing group (max of these two). */
export const MIN_DETOUR_CAP_METERS = 2000;
export const DETOUR_RATIO = 0.6;
/** Groups already on the road accept new riders only while this many free stops remain. */
export const MAX_STOPS_PER_GROUP = 10;
/** Retries when two riders race to join the same group. */
export const MATCH_RETRIES = 2;
