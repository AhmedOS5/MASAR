"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addRequestComment,
  approveRequest,
  createTaskFromRequest,
  rejectRequest,
  uploadRequestAttachment,
} from "@/services/requests.service";
import { useToast } from "@/components/Toast/ToastProvider";

/** All mutations for one request; each refreshes the request + lists and toasts on success. */
export default function useRequestMutations(id) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const refresh = () => {
    // prefix match: the page key uses the URL id (string) while the API id may be numeric
    queryClient.invalidateQueries({ queryKey: ["request"] });
    queryClient.invalidateQueries({ queryKey: ["requests"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return {
    approve: useMutation({
      mutationFn: () => approveRequest(id),
      onSuccess: () => { refresh(); toast.success("تمت الموافقة على الطلب."); },
    }),
    reject: useMutation({
      mutationFn: (reason) => rejectRequest(id, reason),
      onSuccess: () => { refresh(); toast.success("تم رفض الطلب."); },
    }),
    createTask: useMutation({
      mutationFn: () => createTaskFromRequest(id),
      onSuccess: (res) => {
        refresh();
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        toast.success("تم إنشاء مهمة من الطلب.");
        const taskId = res?.data?.id ?? res?.id;
        if (taskId) router.push(`/dashboard/tasks/${taskId}`);
      },
    }),
    comment: useMutation({
      mutationFn: (body) => addRequestComment(id, body),
      onSuccess: () => { refresh(); toast.success("تمت إضافة التعليق."); },
    }),
    upload: useMutation({
      mutationFn: (file) => uploadRequestAttachment(id, file),
      onSuccess: () => { refresh(); toast.success("تم رفع الملف."); },
    }),
  };
}
