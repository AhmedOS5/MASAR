"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTaskComment, updateTask, uploadTaskAttachment } from "@/services/tasks.service";
import { useToast } from "@/components/Toast/ToastProvider";

export default function useTaskMutations(id) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const refresh = () => {
    // prefix match: the page key uses the URL id (string) while the API id may be numeric
    queryClient.invalidateQueries({ queryKey: ["task"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return {
    refresh,
    update: useMutation({
      mutationFn: (body) => updateTask(id, body),
      onSuccess: () => { refresh(); toast.success("تم تحديث المهمة."); },
    }),
    comment: useMutation({
      mutationFn: (body) => addTaskComment(id, body),
      onSuccess: () => { refresh(); toast.success("تمت إضافة التعليق."); },
    }),
    upload: useMutation({
      mutationFn: (file) => uploadTaskAttachment(id, file),
      onSuccess: () => { refresh(); toast.success("تم رفع المرفق."); },
    }),
  };
}
