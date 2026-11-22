"use client";

import { useQuery } from "@tanstack/react-query";
import { Field, Select } from "@/components/ui/Form";
import { listProjects } from "@/services/projects.service";

/** The projects a person can put new work into: the ones they belong to (all of them for the system admin), not archived. */
export function useWorkProjects() {
  return useQuery({
    queryKey: ["projects", "work-options"],
    queryFn: async () => (await listProjects({ status: "active", per_page: 100 })).items,
    staleTime: 60_000,
  });
}

export const projectOptions = (projects) => (projects ?? []).map((p) => ({ value: p.id, label: p.name }));

/** The mandatory "project" choice of every form that creates work (request, task, folder, report). */
export default function ProjectField({ value, onChange, error, label = "المشروع" }) {
  const projects = useWorkProjects();
  return (
    <Field label={label} required error={error}>
      <Select value={value} onChange={onChange} placeholder="اختر المشروع" options={projectOptions(projects.data)} />
    </Field>
  );
}
