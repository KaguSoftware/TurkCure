"use client";

/**
 * The Tiptap editor for a case document.
 *
 * This module (and everything under editor/) is loaded ONLY via
 * next/dynamic({ ssr: false }) — Tiptap must stay out of the SSR bundle and out
 * of every route that doesn't edit a document.
 */

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { buildExtensions } from "./extensions";
import type { EditorDocJSON } from "@/lib/documents/blocks";
import "./editor.css";

export interface CaseDocEditorApi {
  getJSON: () => EditorDocJSON | null;
  setContent: (doc: EditorDocJSON) => void;
}

export function CaseDocEditor({
  initialDoc,
  editable = true,
  onChangeJson,
  onDirty,
  onInvalidContent,
  apiRef,
}: {
  initialDoc: EditorDocJSON;
  editable?: boolean;
  /** Debounced (800ms) and flushed on unmount. */
  onChangeJson?: (doc: EditorDocJSON) => void;
  onDirty?: () => void;
  /**
   * `initialDoc` failed schema validation (a corrupt or outdated draft).
   * Without handling this Tiptap silently falls back to an EMPTY document —
   * and the next save would overwrite the stored draft with it.
   */
  onInvalidContent?: () => void;
  apiRef?: React.MutableRefObject<CaseDocEditorApi | null>;
}) {
  // Held in refs so the editor is never re-created when a parent re-renders.
  const onChangeRef = React.useRef(onChangeJson);
  const onDirtyRef = React.useRef(onDirty);
  const onInvalidRef = React.useRef(onInvalidContent);
  onChangeRef.current = onChangeJson;
  onDirtyRef.current = onDirty;
  onInvalidRef.current = onInvalidContent;

  const changeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tiptap normalises the document as it loads it (a trailing paragraph, schema
  // defaults) and that fires `update` before the user has touched anything.
  // Without this gate the page shows "Unsaved changes" on a freshly opened
  // document, which trains people to ignore the one indicator that matters.
  const ready = React.useRef(false);

  const editor = useEditor({
    extensions: buildExtensions("Start typing…"),
    content: initialDoc,
    editable,
    immediatelyRender: false,
    enableContentCheck: true,
    onContentError() {
      // Deferred: this fires during editor creation, before parents have refs.
      setTimeout(() => onInvalidRef.current?.(), 0);
    },
    onCreate() {
      // Anything after the first paint is a real edit.
      requestAnimationFrame(() => {
        ready.current = true;
      });
    },
    onUpdate({ editor: e }) {
      if (!ready.current) return;
      onDirtyRef.current?.();
      if (!onChangeRef.current) return;
      if (changeTimer.current) clearTimeout(changeTimer.current);
      changeTimer.current = setTimeout(() => {
        onChangeRef.current?.(e.getJSON() as EditorDocJSON);
      }, 800);
    },
    editorProps: { attributes: { class: "focus:outline-none" } },
  });

  // Flush (not just drop) a pending debounced change on unmount — otherwise the
  // last ~800ms of typing never reaches the draft.
  React.useEffect(() => {
    return () => {
      if (!changeTimer.current) return;
      clearTimeout(changeTimer.current);
      changeTimer.current = null;
      const e = editorRef.current;
      if (e) onChangeRef.current?.(e.getJSON() as EditorDocJSON);
    };
  }, []);

  const editorRef = React.useRef<Editor | null>(null);
  editorRef.current = editor;

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // next/dynamic doesn't forward refs, so the API is handed over through a prop.
  React.useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      // Plain JSON, not ProseMirror's node objects — see the note in
      // DocumentEditorPage.currentJson(). Anything that crosses a server-action
      // boundary or gets stored must be structurally plain.
      getJSON: () =>
        editor ? (JSON.parse(JSON.stringify(editor.getJSON())) as EditorDocJSON) : null,
      setContent: (doc) => {
        // Programmatic content swaps (resets, rebuilds) must NOT emit `update`:
        // Tiptap v3 defaults emitUpdate to true, which would make a reset look
        // like a user edit — dirty flag plus an autosave loop.
        editor?.commands.setContent(doc, { emitUpdate: false });
      },
    };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  }, [editor, apiRef]);

  return (
    <div className="case-doc-editor">
      <div className="doc-sheet">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
