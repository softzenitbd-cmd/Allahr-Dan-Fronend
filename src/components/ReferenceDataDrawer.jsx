import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Edit, Plus, Trash2, X } from 'lucide-react';
import useStore from '../store/useStore';
import { t } from '../utils/i18n';
import { toast } from 'react-toastify';
import { showConfirmDialog, showSuccessAlert } from '../utils/alert';

/**
 * Managing the two reference tables behind the product form.
 *
 * Categories and units are created implicitly by typing a new name on a
 * product, which is convenient but leaves no way to fix a typo or drop one
 * that was never used. This is that way.
 *
 * Deleting is deliberately not offered for anything still in use: the server
 * sets a product's category to null on delete, which would quietly strand
 * those products under no category at all.
 */
const ReferenceDataDrawer = ({ onClose }) => {
  const {
    categories, units, inventory, language,
    addCategory, renameCategory, deleteCategory,
    addUnit, renameUnit, deleteUnit,
  } = useStore();

  const [tab, setTab] = useState('Categories');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const isCategories = tab === 'Categories';
  const rows = isCategories ? (categories || []) : (units || []);

  // How many products each one is attached to, so nothing in use is deleted
  // by accident.
  const usageOf = (name) => (inventory || []).filter(
    (p) => (isCategories ? p.category : p.unit) === name
  ).length;

  const run = async (fn, successMessage) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res?.ok) {
      toast.success(successMessage);
      setNewName('');
      setEditing(null);
    }
    return res;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (rows.some((r) => (r.name || '').toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    await run(
      () => (isCategories ? addCategory(name) : addUnit(name)),
      `${isCategories ? 'Category' : 'Unit'} "${name}" added.`
    );
  };

  const handleRename = async () => {
    const name = (editing.name || '').trim();
    if (!name) return;
    await run(
      () => (isCategories ? renameCategory(editing.id, name) : renameUnit(editing.id, name)),
      'Renamed.'
    );
  };

  const handleDelete = async (row) => {
    const used = usageOf(row.name);
    if (used > 0) {
      toast.error(
        `"${row.name}" is used by ${used} product${used > 1 ? 's' : ''}. ` +
        'Move them first, then delete it.'
      );
      return;
    }
    const isConfirmed = await showConfirmDialog({
      title: `"${row.name}" মুছবেন?`,
      text: 'আপনি কি নিশ্চিত এটি মুছে ফেলতে চান?',
      confirmButtonText: 'হ্যাঁ, মুছুন',
      cancelButtonText: 'বাতিল',
      isDanger: true,
    });
    if (!isConfirmed) return;
    await run(
      () => (isCategories ? deleteCategory(row.id) : deleteUnit(row.id)),
      `"${row.name}" deleted.`
    );
  };

  return createPortal(
    <div className="drawer-overlay">
      <div className="drawer-container">
        <div className="drawer-header">
          <h2>{t(language, 'Manage Categories & Units')}</h2>
          <button className="drawer-close-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="drawer-body">
          <div className="segmented-control mb-4">
            <button type="button" className={isCategories ? 'active' : ''} onClick={() => { setTab('Categories'); setEditing(null); }}>
              {t(language, 'Categories')} ({(categories || []).length})
            </button>
            <button type="button" className={!isCategories ? 'active' : ''} onClick={() => { setTab('Units'); setEditing(null); }}>
              {t(language, 'Units')} ({(units || []).length})
            </button>
          </div>

          <form onSubmit={handleAdd} className="flex-align-gap mb-4" style={{ gap: '0.5rem' }}>
            <input
              type="text"
              className="w-full"
              placeholder={isCategories
                ? (language === 'bn' ? 'নতুন ক্যাটাগরির নাম' : 'New category name')
                : (language === 'bn' ? 'নতুন ইউনিটের নাম' : 'New unit name')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn-primary flex-align-gap" disabled={busy || !newName.trim()}>
              <Plus size={16} /> {t(language, 'Add')}
            </button>
          </form>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t(language, 'Name')}</th>
                  <th style={{ textAlign: 'center' }}>{language === 'bn' ? 'ব্যবহৃত' : 'In use'}</th>
                  <th style={{ textAlign: 'center' }}>{t(language, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan="3" className="text-center text-muted" style={{ padding: '1.5rem' }}>
                    {language === 'bn' ? 'কিছু নেই।' : 'Nothing here yet.'}
                  </td></tr>
                ) : (
                  rows.map((row) => {
                    const used = usageOf(row.name);
                    const isEditing = editing?.id === row.id;
                    return (
                      <tr key={row.id}>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                              style={{ width: '100%' }}
                              autoFocus
                            />
                          ) : (
                            <span className="font-bold">{row.name}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }} className={used ? '' : 'text-muted'}>
                          {used || '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="flex-align-gap" style={{ justifyContent: 'center', flexWrap: 'nowrap' }}>
                            {isEditing ? (
                              <>
                                <button className="btn-icon text-success" title="Save" onClick={handleRename} disabled={busy}>
                                  <Check size={16} />
                                </button>
                                <button className="btn-icon text-muted" title="Cancel" onClick={() => setEditing(null)}>
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn-icon text-info"
                                  title="Rename"
                                  onClick={() => setEditing({ id: row.id, name: row.name })}
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  className="btn-icon text-danger"
                                  title={used ? `Used by ${used} product(s)` : 'Delete'}
                                  onClick={() => handleDelete(row)}
                                  style={used ? { opacity: 0.4 } : undefined}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-muted text-sm mt-4">
            {language === 'bn'
              ? 'নতুন পণ্য যোগ করার সময় নতুন নাম লিখলে সেটি নিজে থেকেই এখানে যুক্ত হয়। ব্যবহৃত কোনোটি মোছা যাবে না।'
              : 'Typing a new name on a product adds it here automatically. Anything still in use cannot be deleted.'}
          </p>
        </div>

        <div className="drawer-footer">
          <button type="button" className="btn-outline" onClick={onClose}>{t(language, 'Close')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReferenceDataDrawer;
