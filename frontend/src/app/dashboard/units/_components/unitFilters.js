// Filter predicates keyed by the tab codes used in UnitsFilter.
export const UNIT_FILTERS = {
  all: () => true,
  active: (u) => u.status === "active",
  inactive: (u) => u.status === "inactive",
  core: (u) => u.tier === "core",
  optional: (u) => u.tier === "optional",
  setup: (u) => u.status === "setup_required",
};
