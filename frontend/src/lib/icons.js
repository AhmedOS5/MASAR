import {
  Monitor,
  MapPin,
  Users,
  BarChart3,
  Briefcase,
  ShieldAlert,
  Folder,
  Layers,
} from "lucide-react";

// Backend sends an icon KEY per unit; the UI owns the actual glyph.
const UNIT_ICONS = {
  monitor: Monitor,
  "map-pin": MapPin,
  users: Users,
  "bar-chart": BarChart3,
  briefcase: Briefcase,
  shield: ShieldAlert,
  folder: Folder,
};

/** <UnitIcon name="monitor" size={16} /> */
export function UnitIcon({ name, ...props }) {
  const Icon = UNIT_ICONS[name] || Layers;
  return <Icon {...props} />;
}
