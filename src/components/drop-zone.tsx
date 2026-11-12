"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { acceptsFile } from "@/lib/form-kit";

// A file picker that also takes dropped files. `children` is what the zone says ("Drop files here or choose").
// Files that do not match `accept` come back in `rejected`, so the caller can name them.
export function DropZone({
  onFiles,
  accept,
  multiple = true,
  disabled,
  children,
}: {
  onFiles: (accepted: File[], rejected: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = (files: File[]) => {
    const usable = multiple ? files : files.slice(0, 1);
    onFiles(
      usable.filter((f) => acceptsFile(f, accept)),
      usable.filter((f) => !acceptsFile(f, accept)),
    );
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    if (!disabled) take(Array.from(event.dataTransfer.files));
  };

  return (
    <label
      data-over={over ? "" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-4 py-4 text-center text-sm text-muted transition focus-within:border-accent data-[over]:border-accent data-[over]:bg-surface-2 data-[over]:text-ink ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Kept in the page (not display:none) so the keyboard can reach it. */}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          take(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {children}
    </label>
  );
}
