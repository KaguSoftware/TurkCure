"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

/**
 * WYSIWYG instruction editor. Rich text is edited directly (bold looks bold,
 * tables are real tables) while the document is stored as markdown — the same
 * markdown the PDF renderer consumes, so the PDF matches what you see here.
 */
export function MarkdownEditor({
  value,
  onChange,
  rows = 12,
  placeholder = "Write the instructions…",
  className,
  name,
  uploadImage,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Optional form field name — renders a hidden input for uncontrolled form posts. */
  name?: string;
  /** Uploads a device image and resolves to its permanent public URL. */
  uploadImage?: (file: File) => Promise<string>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Tracks the markdown we last emitted so external echoes don't reset the cursor.
  const lastEmitted = React.useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    // Re-render on every transaction so toolbar active states track the selection.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: { openOnClick: false },
      }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, bulletListMarker: "-", linkify: true }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const md = (
        editor.storage as unknown as { markdown: { getMarkdown: () => string } }
      ).markdown.getMarkdown();
      lastEmitted.current = md;
      onChange(md);
    },
    editorProps: {
      attributes: { class: "md-prose focus:outline-none" },
    },
  });

  // Adopt external value changes (e.g. switching the edited row) without
  // clobbering the cursor on our own change echoes.
  React.useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value);
  }, [editor, value]);

  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setExpanded(false);
      }
    };
    // Capture phase so a surrounding Dialog's own Escape handler doesn't close it too.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  function setLink(editor: Editor) {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertNote(editor: Editor) {
    if (editor.isActive("blockquote")) {
      editor.chain().focus().lift("blockquote").run();
      return;
    }
    const empty = editor.state.selection.empty && !editor.state.selection.$from.parent.textContent;
    const chain = editor.chain().focus().toggleBlockquote();
    if (empty) {
      chain.insertContent([{ type: "text", text: "Note: ", marks: [{ type: "bold" }] }]).run();
    } else {
      chain.run();
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    if (!uploadImage) {
      const url = window.prompt("Image URL");
      if (url) editor.chain().focus().setImage({ src: url }).run();
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function runToolbar(id: string) {
    if (!editor) return;
    switch (id) {
      case "bold":
        editor.chain().focus().toggleBold().run();
        break;
      case "italic":
        editor.chain().focus().toggleItalic().run();
        break;
      case "h2":
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case "link":
        setLink(editor);
        break;
      case "bulletList":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "orderedList":
        editor.chain().focus().toggleOrderedList().run();
        break;
      case "note":
        insertNote(editor);
        break;
      case "table":
        if (editor.isActive("table")) editor.chain().focus().addRowAfter().run();
        else editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
        break;
      case "deleteTable":
        editor.chain().focus().deleteTable().run();
        break;
      case "image":
        fileRef.current?.click();
        break;
    }
  }

  if (!editor) return null;

  const buttons: {
    id: string;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    group?: boolean;
  }[] = [
    { id: "bold", icon: <Bold />, label: "Bold (Ctrl+B)", active: editor.isActive("bold") },
    { id: "italic", icon: <Italic />, label: "Italic (Ctrl+I)", active: editor.isActive("italic") },
    {
      id: "h2",
      icon: <Heading2 />,
      label: "Heading 2",
      active: editor.isActive("heading", { level: 2 }),
      group: true,
    },
    {
      id: "h3",
      icon: <Heading3 />,
      label: "Heading 3",
      active: editor.isActive("heading", { level: 3 }),
    },
    {
      id: "link",
      icon: <LinkIcon />,
      label: "Link (Ctrl+K)",
      active: editor.isActive("link"),
      group: true,
    },
    {
      id: "bulletList",
      icon: <List />,
      label: "Bullet list",
      active: editor.isActive("bulletList"),
    },
    {
      id: "orderedList",
      icon: <ListOrdered />,
      label: "Numbered list",
      active: editor.isActive("orderedList"),
    },
    { id: "note", icon: <Info />, label: "Note", active: editor.isActive("blockquote") },
    {
      id: "table",
      icon: <TableIcon />,
      label: editor.isActive("table") ? "Add row below" : "Insert table",
      active: editor.isActive("table"),
    },
    {
      id: "image",
      icon: uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />,
      label: "Image from device",
    },
  ];

  const panel = (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-card transition-shadow focus-within:ring-2 focus-within:ring-[var(--ring)]",
        expanded && "fixed inset-3 z-70 flex flex-col shadow-pop sm:inset-8",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-border bg-surface-hover px-2 py-1.5">
        {buttons.map((b, i) => (
          <React.Fragment key={b.label}>
            {b.group && i > 0 && <span className="mx-1 h-4 w-px bg-border" />}
            <button
              type="button"
              title={b.label}
              aria-label={b.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runToolbar(b.id)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer [&_svg]:size-4",
                b.active
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface hover:text-foreground"
              )}
            >
              {b.icon}
            </button>
          </React.Fragment>
        ))}
        {editor.isActive("table") && (
          <button
            type="button"
            title="Delete table"
            aria-label="Delete table"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runToolbar("deleteTable")}
            className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-danger cursor-pointer [&_svg]:size-4"
          >
            <Trash2 />
          </button>
        )}
        <span className="ml-auto" />
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          title={expanded ? "Exit full screen (Esc)" : "Full screen"}
          aria-label={expanded ? "Exit full screen" : "Full screen"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setExpanded((x) => !x)}
          className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground cursor-pointer [&_svg]:size-4"
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </button>
      </div>
      <div
        className={cn("overflow-y-auto px-3 py-2", expanded && "flex-1")}
        style={expanded ? undefined : { minHeight: rows * 20 + 16, maxHeight: 520 }}
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
        disabled={uploading}
      />
    </div>
  );

  return (
    <>
      {/* The hidden form input stays in place so portaling the panel never removes it from the form. */}
      {name && <input type="hidden" name={name} value={value} />}
      {expanded ? (
        // Portal to <body>: position:fixed inside a transformed ancestor (e.g. the
        // Dialog's pop animation) would resolve against that ancestor, not the viewport.
        createPortal(
          <>
            <div
              className="animate-overlay fixed inset-0 z-60 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setExpanded(false)}
            />
            {panel}
          </>,
          document.body
        )
      ) : (
        panel
      )}
    </>
  );
}
