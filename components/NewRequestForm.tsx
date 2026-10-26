"use client";

import { useRouter } from "next/navigation";
import type { RequestDto } from "@/lib/db/requests";
import { api } from "@/lib/client/api";
import { RequestForm } from "./RequestForm";

export function NewRequestForm() {
  const router = useRouter();
  return (
    <RequestForm
      submitLabel="Raise request"
      onCancel={() => router.push("/")}
      onSubmit={async (values) => {
        const { data } = await api<RequestDto>("/api/requests", { method: "POST", json: values });
        router.push(`/requests/${data.id}`);
      }}
    />
  );
}
