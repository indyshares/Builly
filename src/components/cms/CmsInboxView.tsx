import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CmsDocument,
  InboxSubmission,
  InboxCategory,
  InboxNote,
  InboxActivity,
  CmsFormDefinition,
} from '../../types/cms';
import {
  Inbox,
  Mail,
  MailOpen,
  Star,
  Archive,
  AlertOctagon,
  Trash2,
  Tag,
  Search,
  Check,
  Clock,
  User,
  Phone,
  Lock,
  Plus,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ShieldAlert,
  Calendar,
  Globe,
  CornerDownRight,
  Eye,
} from 'lucide-react';

interface CmsInboxViewProps {
  siteCms: CmsDocument;
  onUpdateCms: (nextCms: CmsDocument) => void;
  showToast: (msg: string) => void;
}

type StatusFilter = 'all' | 'unread' | 'read' | 'starred' | 'archived' | 'spam';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-500' },
};

export const CmsInboxView: React.FC<CmsInboxViewProps> = ({
  siteCms,
  onUpdateCms,
  showToast,
}) => {
  const { t } = useTranslation();

  const submissions = useMemo<InboxSubmission[]>(
    () => siteCms.inboxSubmissions || [],
    [siteCms.inboxSubmissions]
  );
  const categories = useMemo<InboxCategory[]>(
    () => siteCms.inboxCategories || [],
    [siteCms.inboxCategories]
  );
  const forms = useMemo<CmsFormDefinition[]>(
    () => siteCms.forms || [],
    [siteCms.forms]
  );
  const notes = useMemo<InboxNote[]>(
    () => siteCms.inboxNotes || [],
    [siteCms.inboxNotes]
  );
  const activities = useMemo<InboxActivity[]>(
    () => siteCms.inboxActivities || [],
    [siteCms.inboxActivities]
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(
    submissions[0]?.inbox_item_id || null
  );
  const [newNoteText, setNewNoteText] = useState('');
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('blue');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter((item) => {
        // Status filter
        if (statusFilter === 'unread' && item.read_status !== 'unread') return false;
        if (statusFilter === 'read' && item.read_status !== 'read') return false;
        if (statusFilter === 'starred' && !item.starred) return false;
        if (statusFilter === 'archived' && !item.archived) return false;
        if (statusFilter === 'spam' && item.spam_status !== 'spam') return false;
        if (statusFilter !== 'archived' && item.archived && statusFilter !== 'all') return false;
        if (statusFilter !== 'spam' && item.spam_status === 'spam' && statusFilter !== 'all') return false;

        // Category filter
        if (selectedCategory !== 'all' && item.category_id !== selectedCategory) return false;

        // Form filter
        if (selectedForm !== 'all' && item.form_id !== selectedForm) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchForm = item.form_name_snapshot.toLowerCase().includes(q);
          const matchValues = Object.values(item.fields || {}).some((v) =>
            String(v).toLowerCase().includes(q)
          );
          if (!matchForm && !matchValues) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.submitted_at).getTime();
        const timeB = new Date(b.submitted_at).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      });
  }, [submissions, statusFilter, selectedCategory, selectedForm, searchQuery, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const paginatedSubmissions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubmissions.slice(start, start + pageSize);
  }, [filteredSubmissions, currentPage, pageSize]);

  const activeSubmission = useMemo(() => {
    return submissions.find((s) => s.inbox_item_id === activeItemId) || null;
  }, [submissions, activeItemId]);

  const activeNotes = useMemo(() => {
    if (!activeItemId) return [];
    return notes.filter((n) => n.inbox_item_id === activeItemId);
  }, [notes, activeItemId]);

  const activeActivities = useMemo(() => {
    if (!activeItemId) return [];
    return activities.filter((a) => a.inbox_item_id === activeItemId);
  }, [activities, activeItemId]);

  // Unread count
  const unreadCount = useMemo(() => {
    return submissions.filter((s) => s.read_status === 'unread' && !s.archived && s.spam_status !== 'spam').length;
  }, [submissions]);

  // Helper to record activity
  const recordActivity = (itemId: string, action: string, prev?: string, next?: string) => {
    const act: InboxActivity = {
      activity_id: 'act_' + Math.random().toString(36).substring(2, 9),
      inbox_item_id: itemId,
      action,
      previous_value: prev,
      new_value: next,
      actor_id: 'owner',
      created_at: new Date().toISOString(),
    };
    return [...activities, act];
  };

  // Actions
  const handleToggleStar = (itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const item = submissions.find((s) => s.inbox_item_id === itemId);
    if (!item) return;
    const nextStarred = !item.starred;
    const updated = submissions.map((s) =>
      s.inbox_item_id === itemId ? { ...s, starred: nextStarred, updated_at: new Date().toISOString() } : s
    );
    const updatedActivities = recordActivity(itemId, nextStarred ? 'starred' : 'unstarred');
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxActivities: updatedActivities,
    });
    showToast(nextStarred ? 'Submission starred' : 'Submission unstarred');
  };

  const handleToggleRead = (itemId: string, forceRead?: boolean) => {
    const item = submissions.find((s) => s.inbox_item_id === itemId);
    if (!item) return;
    const nextRead: 'read' | 'unread' =
      forceRead !== undefined
        ? forceRead
          ? 'read'
          : 'unread'
        : item.read_status === 'unread'
        ? 'read'
        : 'unread';
    const updated = submissions.map((s) =>
      s.inbox_item_id === itemId
        ? {
            ...s,
            read_status: nextRead,
            read_at: nextRead === 'read' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }
        : s
    );
    const updatedActivities = recordActivity(itemId, nextRead === 'read' ? 'marked_read' : 'marked_unread');
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxActivities: updatedActivities,
    });
  };

  const handleToggleArchive = (itemId: string) => {
    const item = submissions.find((s) => s.inbox_item_id === itemId);
    if (!item) return;
    const nextArchived = !item.archived;
    const updated = submissions.map((s) =>
      s.inbox_item_id === itemId
        ? { ...s, archived: nextArchived, updated_at: new Date().toISOString() }
        : s
    );
    const updatedActivities = recordActivity(itemId, nextArchived ? 'archived' : 'unarchived');
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxActivities: updatedActivities,
    });
    showToast(nextArchived ? 'Moved to Archive' : 'Restored from Archive');
  };

  const handleToggleSpam = (itemId: string) => {
    const item = submissions.find((s) => s.inbox_item_id === itemId);
    if (!item) return;
    const nextSpam: 'ham' | 'spam' = item.spam_status === 'spam' ? 'ham' : 'spam';
    const updated = submissions.map((s) =>
      s.inbox_item_id === itemId
        ? { ...s, spam_status: nextSpam, updated_at: new Date().toISOString() }
        : s
    );
    const updatedActivities = recordActivity(itemId, nextSpam === 'spam' ? 'marked_spam' : 'unmarked_spam');
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxActivities: updatedActivities,
    });
    showToast(nextSpam === 'spam' ? 'Marked as Spam' : 'Removed from Spam');
  };

  const handleDeleteSubmission = (itemId: string) => {
    if (!window.confirm('Delete this submission permanently from Inbox?')) return;
    const updated = submissions.filter((s) => s.inbox_item_id !== itemId);
    const updatedNotes = notes.filter((n) => n.inbox_item_id !== itemId);
    const updatedActivities = activities.filter((a) => a.inbox_item_id !== itemId);
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxNotes: updatedNotes,
      inboxActivities: updatedActivities,
    });
    if (activeItemId === itemId) {
      setActiveItemId(updated[0]?.inbox_item_id || null);
    }
    showToast('Submission deleted');
  };

  const handleChangeCategory = (itemId: string, newCategoryId: string) => {
    const item = submissions.find((s) => s.inbox_item_id === itemId);
    if (!item) return;
    const oldCat = categories.find((c) => c.category_id === item.category_id)?.name;
    const newCat = categories.find((c) => c.category_id === newCategoryId)?.name;
    const updated = submissions.map((s) =>
      s.inbox_item_id === itemId
        ? { ...s, category_id: newCategoryId, updated_at: new Date().toISOString() }
        : s
    );
    const updatedActivities = recordActivity(itemId, 'changed_category', oldCat, newCat);
    onUpdateCms({
      ...siteCms,
      inboxSubmissions: updated,
      inboxActivities: updatedActivities,
    });
    showToast(`Category updated to ${newCat}`);
  };

  // Add Note
  const handleAddNote = () => {
    if (!activeItemId || !newNoteText.trim()) return;
    const note: InboxNote = {
      note_id: 'note_' + Math.random().toString(36).substring(2, 9),
      inbox_item_id: activeItemId,
      author_id: 'owner',
      author_name: 'Studio Owner',
      note_content: newNoteText.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updatedActivities = recordActivity(activeItemId, 'added_note');
    onUpdateCms({
      ...siteCms,
      inboxNotes: [note, ...notes],
      inboxActivities: updatedActivities,
    });
    setNewNoteText('');
    showToast('Internal note saved');
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedNotes = notes.filter((n) => n.note_id !== noteId);
    onUpdateCms({
      ...siteCms,
      inboxNotes: updatedNotes,
    });
    showToast('Note deleted');
  };

  // Create Category
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const catId = 'cat_' + newCatName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (categories.some((c) => c.category_id === catId)) {
      showToast('A category with this name already exists.');
      return;
    }
    const newCat: InboxCategory = {
      category_id: catId,
      name: newCatName.trim(),
      description: 'Custom inbox category',
      color: newCatColor,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onUpdateCms({
      ...siteCms,
      inboxCategories: [...categories, newCat],
    });
    setNewCatName('');
    setIsAddCategoryOpen(false);
    showToast(`Category "${newCat.name}" created`);
  };

  // Bulk actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemIds(paginatedSubmissions.map((s) => s.inbox_item_id));
    } else {
      setSelectedItemIds([]);
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkMarkRead = (read: boolean) => {
    if (selectedItemIds.length === 0) return;
    const targetStatus: 'read' | 'unread' = read ? 'read' : 'unread';
    const updated = submissions.map((s) =>
      selectedItemIds.includes(s.inbox_item_id)
        ? {
            ...s,
            read_status: targetStatus,
            read_at: read ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }
        : s
    );
    onUpdateCms({ ...siteCms, inboxSubmissions: updated });
    setSelectedItemIds([]);
    showToast(`Marked ${selectedItemIds.length} as ${targetStatus}`);
  };

  const handleBulkArchive = () => {
    if (selectedItemIds.length === 0) return;
    const updated = submissions.map((s) =>
      selectedItemIds.includes(s.inbox_item_id)
        ? { ...s, archived: true, updated_at: new Date().toISOString() }
        : s
    );
    onUpdateCms({ ...siteCms, inboxSubmissions: updated });
    setSelectedItemIds([]);
    showToast(`Archived ${selectedItemIds.length} submissions`);
  };

  const handleBulkDelete = () => {
    if (selectedItemIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedItemIds.length} submissions permanently?`)) return;
    const updated = submissions.filter((s) => !selectedItemIds.includes(s.inbox_item_id));
    onUpdateCms({ ...siteCms, inboxSubmissions: updated });
    setSelectedItemIds([]);
    if (activeItemId && selectedItemIds.includes(activeItemId)) {
      setActiveItemId(updated[0]?.inbox_item_id || null);
    }
    showToast(`Deleted ${selectedItemIds.length} submissions`);
  };

  // Formatter for submitter display
  const getSubmitterInfo = (item: InboxSubmission) => {
    const f = item.fields || {};
    const name = f.full_name || f.name || f.first_name || f.client_name || 'Anonymous Submitter';
    const email = f.email || f.work_email || '';
    const preview = f.message || f.details || f.feedback || f.cover_note || Object.values(f)[0] || '';
    return { name, email, preview: String(preview) };
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100/50">
      {/* 1. Left Nav & Category Rail */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
            <Inbox className="w-4 h-4 text-blue-600" />
            <span>Unified Inbox</span>
          </div>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>

        {/* Status Filters */}
        <div className="p-2 space-y-0.5 border-b border-slate-100">
          {[
            { id: 'all', label: 'All Submissions', icon: Inbox, count: submissions.length },
            { id: 'unread', label: 'Unread', icon: Mail, count: submissions.filter((s) => s.read_status === 'unread' && !s.archived).length },
            { id: 'read', label: 'Read', icon: MailOpen, count: submissions.filter((s) => s.read_status === 'read' && !s.archived).length },
            { id: 'starred', label: 'Starred', icon: Star, count: submissions.filter((s) => s.starred).length },
            { id: 'archived', label: 'Archived', icon: Archive, count: submissions.filter((s) => s.archived).length },
            { id: 'spam', label: 'Spam', icon: AlertOctagon, count: submissions.filter((s) => s.spam_status === 'spam').length },
          ].map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setStatusFilter(id as StatusFilter);
                setCurrentPage(1);
              }}
              className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                statusFilter === id
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${statusFilter === id ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{label}</span>
              </div>
              <span className="font-mono text-[11px] opacity-75">{count}</span>
            </button>
          ))}
        </div>

        {/* Categories Section */}
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Categories
            </span>
            <button
              type="button"
              onClick={() => setIsAddCategoryOpen((p) => !p)}
              className="p-1 hover:bg-slate-100 text-slate-500 rounded"
              title="Add Category"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAddCategoryOpen && (
            <form onSubmit={handleCreateCategory} className="mb-2 p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <input
                type="text"
                placeholder="Category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                autoFocus
              />
              <div className="flex items-center gap-1">
                {['blue', 'purple', 'emerald', 'amber', 'rose', 'slate'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setNewCatColor(col)}
                    className={`w-4 h-4 rounded-full border ${CATEGORY_COLORS[col].dot} ${
                      newCatColor === col ? 'ring-2 ring-slate-900' : ''
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2 py-0.5 text-[11px] bg-slate-900 text-white rounded font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setCurrentPage(1);
              }}
              className={`w-full min-h-[30px] px-2 py-1 rounded text-xs flex items-center justify-between ${
                selectedCategory === 'all'
                  ? 'bg-slate-100 font-semibold text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>All Categories</span>
              <span className="font-mono text-[11px]">{submissions.length}</span>
            </button>
            {categories.map((cat) => {
              const count = submissions.filter((s) => s.category_id === cat.category_id).length;
              const colorDef = CATEGORY_COLORS[cat.color] || CATEGORY_COLORS.slate;
              return (
                <button
                  key={cat.category_id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.category_id);
                    setCurrentPage(1);
                  }}
                  className={`w-full min-h-[30px] px-2 py-1 rounded text-xs flex items-center justify-between ${
                    selectedCategory === cat.category_id
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`w-2 h-2 rounded-full ${colorDef.dot} shrink-0`} />
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <span className="font-mono text-[11px] shrink-0">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Forms Section */}
        <div className="p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Forms
          </div>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedForm('all');
                setCurrentPage(1);
              }}
              className={`w-full min-h-[30px] px-2 py-1 rounded text-xs flex items-center justify-between ${
                selectedForm === 'all'
                  ? 'bg-slate-100 font-semibold text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>All Forms</span>
              <span className="font-mono text-[11px]">{submissions.length}</span>
            </button>
            {forms.map((form) => {
              const count = submissions.filter((s) => s.form_id === form.formId).length;
              return (
                <button
                  key={form.formId}
                  type="button"
                  onClick={() => {
                    setSelectedForm(form.formId);
                    setCurrentPage(1);
                  }}
                  className={`w-full min-h-[30px] px-2 py-1 rounded text-xs flex items-center justify-between ${
                    selectedForm === form.formId
                      ? 'bg-slate-100 font-semibold text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{form.name}</span>
                  <span className="font-mono text-[11px] shrink-0">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* 2. Middle List Panel */}
      <div className="w-80 sm:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
        {/* Search & Bulk Toolbar */}
        <div className="p-3 border-b border-slate-200 space-y-2 bg-slate-50/50">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search sender, email, form..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Select all submissions"
                checked={
                  paginatedSubmissions.length > 0 &&
                  paginatedSubmissions.every((s) => selectedItemIds.includes(s.inbox_item_id))
                }
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
              />
              <span className="text-slate-500 text-[11px]">
                {filteredSubmissions.length} message{filteredSubmissions.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Sort submissions order"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>

          {selectedItemIds.length > 0 && (
            <div className="flex items-center gap-1 pt-1.5 border-t border-slate-200 text-xs">
              <span className="text-[11px] font-semibold text-slate-700 mr-1">
                {selectedItemIds.length} selected:
              </span>
              <button
                type="button"
                onClick={() => handleBulkMarkRead(true)}
                className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-[11px]"
                title="Mark Read"
              >
                Read
              </button>
              <button
                type="button"
                onClick={() => handleBulkMarkRead(false)}
                className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-[11px]"
                title="Mark Unread"
              >
                Unread
              </button>
              <button
                type="button"
                onClick={handleBulkArchive}
                className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded text-[11px]"
                title="Archive"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-[11px]"
                title="Delete"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* List of submissions */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {paginatedSubmissions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <MailOpen className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs">No submissions match current filters.</p>
            </div>
          ) : (
            paginatedSubmissions.map((item) => {
              const isSelected = item.inbox_item_id === activeItemId;
              const isChecked = selectedItemIds.includes(item.inbox_item_id);
              const isUnread = item.read_status === 'unread';
              const { name, email, preview } = getSubmitterInfo(item);
              const cat = categories.find((c) => c.category_id === item.category_id);
              const colorDef = cat ? CATEGORY_COLORS[cat.color] || CATEGORY_COLORS.slate : CATEGORY_COLORS.slate;

              return (
                <div
                  key={item.inbox_item_id}
                  onClick={() => {
                    setActiveItemId(item.inbox_item_id);
                    if (isUnread) handleToggleRead(item.inbox_item_id, true);
                  }}
                  className={`p-3 cursor-pointer transition-all flex items-start gap-2.5 relative ${
                    isSelected
                      ? 'bg-blue-50/70 border-l-4 border-blue-600'
                      : isUnread
                      ? 'bg-white hover:bg-slate-50/80 font-medium'
                      : 'bg-slate-50/30 hover:bg-slate-100/60 text-slate-600'
                  }`}
                >
                  {/* Checkbox */}
                  <div className="pt-0.5" onClick={(e) => handleToggleSelect(item.inbox_item_id, e)}>
                    <input
                      type="checkbox"
                      aria-label={`Select submission from ${name}`}
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                    />
                  </div>

                  {/* Star */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleStar(item.inbox_item_id, e)}
                    className="pt-0.5 text-slate-400 hover:text-amber-500"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        item.starred ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                      }`}
                    />
                  </button>

                  {/* Main content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                        <span className={`text-xs truncate ${isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                          {name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {new Date(item.submitted_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-mono truncate max-w-[130px]">
                        {item.form_name_snapshot}
                      </span>
                      {cat && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${colorDef.bg} ${colorDef.text} ${colorDef.border}`}
                        >
                          {cat.name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {preview}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="p-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 disabled:opacity-30 hover:bg-slate-200 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 disabled:opacity-30 hover:bg-slate-200 rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Detail Panel */}
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        {activeSubmission ? (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Detail Top Header */}
            <div className="p-4 sm:p-6 border-b border-slate-200 bg-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">
                      {getSubmitterInfo(activeSubmission).name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleToggleStar(activeSubmission.inbox_item_id)}
                      className="text-slate-400 hover:text-amber-500"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          activeSubmission.starred ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                        }`}
                      />
                    </button>
                    {activeSubmission.read_status === 'unread' ? (
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Unread
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Read
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="font-mono text-slate-600">ID: {activeSubmission.submission_id}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(activeSubmission.submitted_at).toLocaleString()}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      Source: {activeSubmission.source_page || '/'}
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleToggleRead(activeSubmission.inbox_item_id)}
                    className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded text-xs font-medium text-slate-700 flex items-center gap-1"
                  >
                    {activeSubmission.read_status === 'unread' ? (
                      <>
                        <MailOpen className="w-3.5 h-3.5" /> Mark Read
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" /> Mark Unread
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleArchive(activeSubmission.inbox_item_id)}
                    className={`px-2.5 py-1.5 border rounded text-xs font-medium flex items-center gap-1 ${
                      activeSubmission.archived
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {activeSubmission.archived ? 'Unarchive' : 'Archive'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSpam(activeSubmission.inbox_item_id)}
                    className={`px-2.5 py-1.5 border rounded text-xs font-medium flex items-center gap-1 ${
                      activeSubmission.spam_status === 'spam'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <AlertOctagon className="w-3.5 h-3.5" />
                    {activeSubmission.spam_status === 'spam' ? 'Not Spam' : 'Spam'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSubmission(activeSubmission.inbox_item_id)}
                    className="p-1.5 border border-slate-200 hover:bg-red-50 hover:text-red-600 rounded text-slate-400"
                    title="Delete Submission"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Form & Category selector */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 flex-wrap text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Form:</span>
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-mono">
                    {activeSubmission.form_name_snapshot} ({activeSubmission.form_id})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Category:</span>
                  <select
                    aria-label="Change category for submission"
                    value={activeSubmission.category_id}
                    onChange={(e) =>
                      handleChangeCategory(activeSubmission.inbox_item_id, e.target.value)
                    }
                    className="px-2 py-0.5 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800"
                  >
                    {categories.map((c) => (
                      <option key={c.category_id} value={c.category_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                  <span>Worksheet:</span>
                  <span className="text-slate-700 font-semibold">{activeSubmission.destination_worksheet_id}</span>
                </div>
              </div>
            </div>

            {/* Submitted Fields Content */}
            <div className="p-4 sm:p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Submitted Fields
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                  {Object.entries(activeSubmission.fields || {}).map(([key, val]) => {
                    const isLong = String(val).length > 80;
                    const isEmail = String(key).toLowerCase().includes('email') && String(val).includes('@');
                    const isPhone = String(key).toLowerCase().includes('phone');

                    return (
                      <div key={key} className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block font-mono">
                          {key.replace(/_/g, ' ')}
                        </span>
                        {isEmail ? (
                          <a
                            href={`mailto:${val}`}
                            className="text-sm font-medium text-blue-600 hover:underline block"
                          >
                            {String(val)}
                          </a>
                        ) : isPhone ? (
                          <a
                            href={`tel:${val}`}
                            className="text-sm font-medium text-blue-600 hover:underline block font-mono"
                          >
                            {String(val)}
                          </a>
                        ) : isLong ? (
                          <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                            {String(val)}
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-slate-800">
                            {String(val)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Private Internal Notes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Internal Notes
                    </h4>
                  </div>
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    Private · Visible only in Builly CMS
                  </span>
                </div>

                {/* Add Note Input */}
                <div className="flex items-start gap-2">
                  <textarea
                    rows={2}
                    placeholder="Add a private note about this submission (e.g. follow-up call, client budget, next action)..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="flex-1 p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!newNoteText.trim()}
                    className="min-h-[40px] px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
                  >
                    Add Note
                  </button>
                </div>

                {/* Notes list */}
                {activeNotes.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {activeNotes.map((note) => (
                      <div
                        key={note.note_id}
                        className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-lg flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{note.author_name || 'Studio Owner'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(note.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-800 whitespace-pre-wrap">{note.note_content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.note_id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded"
                          title="Delete Note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity History */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Activity History
                </h4>
                <div className="space-y-2">
                  {activeActivities.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No activity recorded yet.</div>
                  ) : (
                    activeActivities.map((act) => (
                      <div key={act.activity_id} className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="font-semibold text-slate-700 capitalize">
                          {act.action.replace(/_/g, ' ')}
                        </span>
                        {act.new_value && (
                          <span className="text-slate-600">to &quot;{act.new_value}&quot;</span>
                        )}
                        <span className="text-slate-400 font-mono">
                          · {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 space-y-3">
            <Inbox className="w-12 h-12 opacity-30" />
            <p className="text-xs font-medium">Select a submission from the list to view full details.</p>
          </div>
        )}
      </div>
    </div>
  );
};
