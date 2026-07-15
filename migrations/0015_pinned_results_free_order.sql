-- 0015: pinned_results — free-form ordering (inline pin UI).
-- The 3-slot "Result Highlights" strip is gone; pins now render as a "Pinned"
-- section at the top of the results list and owners can pin any number of
-- results and drag-reorder them. sort_order becomes an unconstrained int
-- (ordered asc); drop the 0-2 slot check and the unique slot-per-owner key
-- so reordering never collides mid-flight.

alter table public.pinned_results
  drop constraint if exists pinned_results_sort_order_check;
alter table public.pinned_results
  drop constraint if exists pinned_results_owner_kind_owner_key_sort_order_key;
