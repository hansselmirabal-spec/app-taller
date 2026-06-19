'use client';
import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, CheckSquare, Paperclip, Plus, Trash2,
  CheckCircle2, Circle, Check, X, CornerDownRight,
  FileText, Image, File, ChevronDown, ChevronUp, UserPlus, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getStoredUser } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanComment {
  id: string;
  text: string;
  user: string;
  createdAt: string;
  resolved: boolean;
  replies: KanbanReply[];
}

export interface KanbanReply {
  id: string;
  text: string;
  user: string;
  createdAt: string;
}

export interface KanbanCheckItem {
  id: string;
  text: string;
  checked: boolean;
  assignees: string[];
  dueDate?: string;
}

export interface KanbanAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  dataUrl: string;
  addedBy: string;
  createdAt: string;
}

export interface CardData {
  comments: KanbanComment[];
  checklist: KanbanCheckItem[];
  attachments: KanbanAttachment[];
}

// Legacy export (backward compat)
export interface KanbanActivity {
  id: string;
  date: string;
  comment: string;
  user: string;
  createdAt: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kanban_card_data_v2';

function loadAll(): Record<string, CardData> {
  if (typeof window === 'undefined') return {};
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function loadCard(cardId: string): CardData {
  return loadAll()[cardId] ?? { comments: [], checklist: [], attachments: [] };
}

function saveCard(cardId: string, data: CardData) {
  const all = loadAll();
  all[cardId] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)     return 'ahora';
  if (diff < 3600)   return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400)  return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#10b981', '#6366f1', '#f59e0b', '#14b8a6',
];

function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtDueDate(iso: string): { label: string; overdue: boolean; today: boolean } {
  const due  = new Date(iso);
  const now  = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = dueDay.getTime() - todayDay.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return { label: 'Hoy', overdue: false, today: true };
  if (diffDays === 1) return { label: 'Mañana', overdue: false, today: false };
  if (diffDays < 0) return { label: `Venció hace ${Math.abs(diffDays)}d`, overdue: true, today: false };
  return {
    label: due.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
    overdue: false,
    today: false,
  };
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))        return <Image   className="h-4 w-4 text-blue-500" />;
  if (mimeType === 'application/pdf')       return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'h-7 w-7 text-xs' : 'h-5 w-5 text-[10px]';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  );
}

// ─── useCardData hook ─────────────────────────────────────────────────────────

function useCardData(cardId: string) {
  const [data, setData] = useState<CardData>({ comments: [], checklist: [], attachments: [] });

  useEffect(() => { setData(loadCard(cardId)); }, [cardId]);

  function update(next: CardData) {
    setData(next);
    saveCard(cardId, next);
  }

  // Comments
  const addComment = (text: string, user: string) =>
    update({ ...data, comments: [...data.comments, {
      id: `c_${Date.now()}`, text, user,
      createdAt: new Date().toISOString(), resolved: false, replies: [],
    }]});

  const resolveComment = (id: string) =>
    update({ ...data, comments: data.comments.map(c =>
      c.id === id ? { ...c, resolved: !c.resolved } : c)});

  const deleteComment = (id: string) =>
    update({ ...data, comments: data.comments.filter(c => c.id !== id) });

  const addReply = (commentId: string, text: string, user: string) =>
    update({ ...data, comments: data.comments.map(c =>
      c.id === commentId ? { ...c, replies: [...c.replies, {
        id: `r_${Date.now()}`, text, user, createdAt: new Date().toISOString(),
      }]} : c)});

  // Checklist
  const addCheckItem = (text: string, dueDate?: string) =>
    update({ ...data, checklist: [...data.checklist, {
      id: `ci_${Date.now()}`, text, checked: false, assignees: [],
      ...(dueDate ? { dueDate } : {}),
    }]});

  const toggleCheckItem = (id: string) =>
    update({ ...data, checklist: data.checklist.map(i =>
      i.id === id ? { ...i, checked: !i.checked } : i)});

  const deleteCheckItem = (id: string) =>
    update({ ...data, checklist: data.checklist.filter(i => i.id !== id) });

  const toggleCheckAssignee = (itemId: string, user: string) =>
    update({ ...data, checklist: data.checklist.map(i => {
      if (i.id !== itemId) return i;
      const cur = i.assignees ?? [];
      return {
        ...i,
        assignees: cur.includes(user)
          ? cur.filter(a => a !== user)
          : [...cur, user],
      };
    })});

  const setCheckDueDate = (id: string, dueDate: string | undefined) =>
    update({ ...data, checklist: data.checklist.map(i =>
      i.id === id ? { ...i, dueDate } : i)});

  // Attachments
  const addAttachment   = (att: KanbanAttachment) =>
    update({ ...data, attachments: [...data.attachments, att] });
  const deleteAttachment = (id: string) =>
    update({ ...data, attachments: data.attachments.filter(a => a.id !== id) });

  return {
    data,
    addComment, resolveComment, deleteComment, addReply,
    addCheckItem, toggleCheckItem, deleteCheckItem, toggleCheckAssignee, setCheckDueDate,
    addAttachment, deleteAttachment,
  };
}

// ─── CommentItem ──────────────────────────────────────────────────────────────

function CommentItem({
  comment, currentUser, onResolve, onDelete, onReply,
}: {
  comment: KanbanComment;
  currentUser: string;
  onResolve: () => void;
  onDelete: () => void;
  onReply: (text: string) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText]         = useState('');
  const [showReplies, setShowReplies]     = useState(true);

  function submitReply() {
    if (!replyText.trim()) return;
    onReply(replyText.trim());
    setReplyText('');
    setShowReplyForm(false);
  }

  return (
    <div className={`group rounded-xl border p-3 transition-colors ${
      comment.resolved
        ? 'bg-slate-50 border-slate-100 opacity-60'
        : 'bg-white border-slate-100 hover:border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <Avatar name={comment.user} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">{comment.user}</span>
            <span className="text-[10px] text-slate-400">{fmtTime(comment.createdAt)}</span>
            {comment.resolved && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
                <Check className="h-3 w-3" /> Resuelto
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 leading-snug break-words">{comment.text}</p>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex-shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3 mt-2 pl-9">
        <button
          onClick={onResolve}
          className={`flex items-center gap-1 text-xs font-medium transition-colors ${
            comment.resolved
              ? 'text-emerald-600'
              : 'text-slate-400 hover:text-emerald-600'
          }`}
        >
          {comment.resolved
            ? <CheckCircle2 className="h-3.5 w-3.5" />
            : <Circle       className="h-3.5 w-3.5" />
          }
          {comment.resolved ? 'Resuelto' : 'Resolver'}
        </button>

        <button
          onClick={() => setShowReplyForm(f => !f)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 transition-colors"
        >
          <CornerDownRight className="h-3.5 w-3.5" />
          Responder
        </button>

        {comment.replies.length > 0 && (
          <button
            onClick={() => setShowReplies(f => !f)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-auto"
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {comment.replies.length} {comment.replies.length === 1 ? 'respuesta' : 'respuestas'}
          </button>
        )}
      </div>

      {/* Replies list */}
      {showReplies && comment.replies.length > 0 && (
        <div className="mt-2.5 pl-9 space-y-2 border-l-2 border-slate-100">
          {comment.replies.map(r => (
            <div key={r.id} className="flex items-start gap-2">
              <Avatar name={r.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{r.user}</span>
                  <span className="text-[10px] text-slate-400">{fmtTime(r.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-600 leading-snug break-words mt-0.5">{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {showReplyForm && (
        <div className="mt-2.5 pl-9">
          <div className="flex gap-2">
            <textarea
              autoFocus
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Escribe una respuesta..."
              rows={2}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitReply(); }}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={submitReply}
                disabled={!replyText.trim()}
                className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={() => { setShowReplyForm(false); setReplyText(''); }}
                className="px-2 py-1.5 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AssigneePicker ───────────────────────────────────────────────────────────

function AssigneePicker({
  assignees,
  users,
  onToggle,
  onClose,
}: {
  assignees: string[];
  users: string[];
  onToggle: (user: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="absolute z-50 right-0 top-7 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 min-w-[180px]">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-1">
          Responsables
        </p>
        {users.length === 0 && (
          <p className="text-xs text-slate-400 px-3 py-2 italic">Sin usuarios disponibles</p>
        )}
        {users.map(user => {
          const assigned = assignees.includes(user);
          return (
            <button
              key={user}
              onClick={() => onToggle(user)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-50 transition-colors text-left ${
                assigned ? 'bg-blue-50' : ''
              }`}
            >
              <Avatar name={user} size="sm" />
              <span className="flex-1 text-xs text-slate-700 truncate">{user}</span>
              {assigned && <Check className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── ActivitiesPanel ──────────────────────────────────────────────────────────

export function ActivitiesPanel({ cardId, users = [] }: { cardId: string; users?: string[] }) {
  const {
    data,
    addComment, resolveComment, deleteComment, addReply,
    addCheckItem, toggleCheckItem, deleteCheckItem, toggleCheckAssignee, setCheckDueDate,
    addAttachment, deleteAttachment,
  } = useCardData(cardId);

  const [activeForm, setActiveForm]     = useState<'comment' | 'checklist' | null>(null);
  const [commentText, setCommentText]   = useState('');
  const [checkText, setCheckText]       = useState('');
  const [checkDueDate, setCheckDueDateForm] = useState('');
  const [pickerFor, setPickerFor]       = useState<string | null>(null);
  const [dueDateFor, setDueDateFor]     = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const currentUser = typeof window !== 'undefined'
    ? (getStoredUser()?.name ?? 'Usuario')
    : 'Usuario';

  // Merge current user into available list (dedup)
  const allUsers = Array.from(new Set([currentUser, ...users]));

  const checkedCount  = data.checklist.filter(i => i.checked).length;
  const checkProgress = data.checklist.length > 0
    ? Math.round((checkedCount / data.checklist.length) * 100)
    : 0;

  const isEmpty = data.checklist.length === 0
    && data.attachments.length === 0
    && data.comments.length === 0;

  function submitComment() {
    if (!commentText.trim()) return;
    addComment(commentText.trim(), currentUser);
    setCommentText('');
    setActiveForm(null);
  }

  function submitCheckItem() {
    if (!checkText.trim()) return;
    addCheckItem(checkText.trim(), checkDueDate || undefined);
    setCheckText('');
    setCheckDueDateForm('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        addAttachment({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          dataUrl: ev.target?.result as string,
          addedBy: currentUser,
          createdAt: new Date().toISOString(),
        });
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3 flex-shrink-0">
        <button
          onClick={() => setActiveForm(f => f === 'comment' ? null : 'comment')}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
            activeForm === 'comment'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Comentar
        </button>

        <button
          onClick={() => setActiveForm(f => f === 'checklist' ? null : 'checklist')}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
            activeForm === 'checklist'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Checklist
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all bg-white text-slate-600 border-slate-200 hover:border-blue-300"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Adjunto
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Active form ──────────────────────────────────────── */}
      {activeForm === 'comment' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5 mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Avatar name={currentUser} size="md" />
            <span className="text-xs font-semibold text-slate-700">{currentUser}</span>
          </div>
          <textarea
            autoFocus
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Escribe un comentario..."
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitComment(); }}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => { setActiveForm(null); setCommentText(''); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!commentText.trim()} onClick={submitComment}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      {activeForm === 'checklist' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex-shrink-0 space-y-2">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={checkText}
              onChange={e => setCheckText(e.target.value)}
              placeholder="Agregar tarea..."
              className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => {
                if (e.key === 'Enter') submitCheckItem();
                if (e.key === 'Escape') setActiveForm(null);
              }}
            />
            <button
              disabled={!checkText.trim()}
              onClick={submitCheckItem}
              className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setActiveForm(null); setCheckText(''); setCheckDueDateForm(''); }}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={checkDueDate}
              onChange={e => setCheckDueDateForm(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-600"
            />
            {checkDueDate && (
              <button
                onClick={() => setCheckDueDateForm('')}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Quitar fecha"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <span className="text-[10px] text-slate-400 ml-1">Vencimiento (opcional)</span>
          </div>
        </div>
      )}

      {/* ── Scrollable content ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">

        {/* Checklist */}
        {data.checklist.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Checklist</span>
              <span className="text-xs text-slate-400 ml-auto">
                {checkedCount}/{data.checklist.length}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${checkProgress}%`,
                  background: checkProgress === 100 ? '#22c55e' : '#3b82f6',
                }}
              />
            </div>
            <div className="space-y-2">
              {data.checklist.map(item => {
                const assignees = item.assignees ?? [];
                const due = item.dueDate ? fmtDueDate(item.dueDate) : null;
                return (
                  <div key={item.id} className="flex items-start gap-2 group px-1">
                    {/* Toggle check */}
                    <button
                      onClick={() => toggleCheckItem(item.id)}
                      className="flex-shrink-0 transition-colors mt-0.5"
                    >
                      {item.checked
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <Circle       className="h-4 w-4 text-slate-300 hover:text-slate-400" />
                      }
                    </button>

                    {/* Task text + due date */}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm leading-snug block truncate ${
                        item.checked ? 'line-through text-slate-400' : 'text-slate-700'
                      }`}>
                        {item.text}
                      </span>

                      {/* Due date badge */}
                      {due && !item.checked && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {dueDateFor === item.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                type="date"
                                defaultValue={item.dueDate}
                                className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                onChange={e => setCheckDueDate(item.id, e.target.value || undefined)}
                                onBlur={() => setDueDateFor(null)}
                                onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setDueDateFor(null); }}
                              />
                              <button
                                onClick={() => { setCheckDueDate(item.id, undefined); setDueDateFor(null); }}
                                className="text-[10px] text-red-400 hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDueDateFor(item.id)}
                              className={`flex items-center gap-0.5 text-[10px] font-medium rounded px-1 py-0.5 transition-colors ${
                                due.overdue
                                  ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                  : due.today
                                    ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                              title="Cambiar fecha de vencimiento"
                            >
                              <Calendar className="h-2.5 w-2.5" />
                              {due.label}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Assignee avatars + picker button */}
                    <div className="relative flex items-center gap-1 flex-shrink-0">
                      {/* Stacked avatars */}
                      <div className="flex items-center" style={{ direction: 'rtl' }}>
                        {assignees.slice(0, 3).map((u, idx) => (
                          <div
                            key={u}
                            className="rounded-full ring-2 ring-white"
                            style={{ marginLeft: idx === 0 ? 0 : -6, zIndex: assignees.length - idx }}
                            title={u}
                          >
                            <Avatar name={u} size="sm" />
                          </div>
                        ))}
                        {assignees.length > 3 && (
                          <div
                            className="h-5 w-5 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600"
                            style={{ marginLeft: -6, zIndex: 0 }}
                            title={assignees.slice(3).join(', ')}
                          >
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>

                      {/* Assign button */}
                      <button
                        onClick={() => setPickerFor(f => f === item.id ? null : item.id)}
                        className={`p-0.5 rounded transition-all ${
                          pickerFor === item.id
                            ? 'text-blue-500'
                            : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-400'
                        }`}
                        title="Asignar responsable"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>

                      {/* Add due date button (only if no due date yet) */}
                      {!item.dueDate && !item.checked && (
                        <button
                          onClick={() => setDueDateFor(item.id)}
                          className="p-0.5 rounded transition-all opacity-0 group-hover:opacity-100 text-slate-300 hover:text-amber-500"
                          title="Agregar fecha de vencimiento"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Picker dropdown */}
                      {pickerFor === item.id && (
                        <AssigneePicker
                          assignees={assignees}
                          users={allUsers}
                          onToggle={user => toggleCheckAssignee(item.id, user)}
                          onClose={() => setPickerFor(null)}
                        />
                      )}

                      {/* Inline due date input (when adding new) */}
                      {dueDateFor === item.id && !item.dueDate && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setDueDateFor(null)} />
                          <div className="absolute z-50 right-0 top-7 bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[200px]">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                              Fecha de vencimiento
                            </p>
                            <input
                              autoFocus
                              type="date"
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                              onChange={e => {
                                if (e.target.value) {
                                  setCheckDueDate(item.id, e.target.value);
                                  setDueDateFor(null);
                                }
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteCheckItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attachments */}
        {data.attachments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Adjuntos</span>
              <span className="text-xs text-slate-400 ml-auto">{data.attachments.length}</span>
            </div>
            <div className="space-y-1.5">
              {data.attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-2.5 group bg-white border border-slate-100 rounded-xl p-2 hover:border-slate-200 transition-colors"
                >
                  {att.mimeType.startsWith('image/') && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-slate-100"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <FileIcon mimeType={att.mimeType} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{att.name}</p>
                    <p className="text-[10px] text-slate-400">{fmtBytes(att.size)}</p>
                  </div>
                  <button
                    onClick={() => deleteAttachment(att.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Comentarios</span>
            {data.comments.length > 0 && (
              <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                {data.comments.length}
              </span>
            )}
          </div>

          {data.comments.length === 0 && activeForm !== 'comment' && (
            <p className="text-xs text-slate-300 italic pl-1">Sin comentarios</p>
          )}

          <div className="space-y-2">
            {[...data.comments].reverse().map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUser={currentUser}
                onResolve={() => resolveComment(c.id)}
                onDelete={() => deleteComment(c.id)}
                onReply={text => addReply(c.id, text, currentUser)}
              />
            ))}
          </div>
        </div>

        {/* Global empty state */}
        {isEmpty && activeForm === null && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <MessageSquare className="h-8 w-8 mb-2" />
            <p className="text-xs italic">Usá los botones de arriba para agregar actividad</p>
          </div>
        )}
      </div>
    </div>
  );
}
