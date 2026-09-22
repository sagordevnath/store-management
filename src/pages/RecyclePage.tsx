import { useState } from "react";
import { useApp } from "../App";
import type { TrashItem } from "../types";
import { restore, purge, purgeExpired, daysLeft, KIND_ICON, KIND_LABEL, TRASH_RETENTION_DAYS } from "../lib/recycle";
import { fmtDateTime, classNames } from "../lib/helpers";
import { logAudit } from "../lib/audit";
import { Badge, Button, Card, CardHeader, EmptyState, Modal, useToast } from "../ui";
import { IcTrashRestore, IcTrash } from "../icons";

export default function RecyclePage() {
  const { db, update } = useApp();
  const toast = useToast();
  const [confirmPurge, setConfirmPurge] = useState<TrashItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const doRestore = (item: TrashItem) => {
    update((d) => {
      const next = restore(d, item.id);
      return next === d ? d : { ...next, audit: logAudit(next.audit, "restore", KIND_LABEL[item.kind], item.label, "Restored from recycle bin") };
    });
    toast(`${KIND_LABEL[item.kind]} "${item.label}" restored`);
  };

  const doPurge = (item: TrashItem) => {
    update((d) => {
      const next = purge(d, item.id);
      return { ...next, audit: logAudit(next.audit, "purge", KIND_LABEL[item.kind], item.label, "Permanently deleted from recycle bin") };
    });
    toast("Deleted forever", "info");
    setConfirmPurge(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Recycle Bin</h1>
          <p className="text-sm text-ink-500">Deleted items wait here for {TRASH_RETENTION_DAYS} days — restore anytime, then they're gone for good</p>
        </div>
        {db.trash.length > 0 ? (
          <Button variant="danger" onClick={() => setConfirmEmpty(true)}>Empty bin</Button>
        ) : null}
      </div>

      <Card>
        <CardHeader title={`${db.trash.length} item${db.trash.length === 1 ? "" : "s"} in the bin`} subtitle="Oldest items expire first and are removed automatically" />
        {db.trash.length === 0 ? (
          <EmptyState icon={<IcTrashRestore size={20} />} title="The bin is empty" subtitle="Products, customers, suppliers, expenses and sales you delete land here first — nothing disappears instantly." />
        ) : (
          <div className="divide-y divide-ink-100">
            {db.trash.map((t) => {
              const left = daysLeft(t.deletedAt);
              const urgent = left <= 5;
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-lg">{KIND_ICON[t.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{t.label}</p>
                    <p className="truncate text-xs text-ink-400">
                      {KIND_LABEL[t.kind]} · {t.sub} · deleted {fmtDateTime(t.deletedAt)} by {t.deletedBy}
                    </p>
                  </div>
                  <Badge tone={urgent ? "red" : "neutral"}>{left === 0 ? "expires today" : `${left} day${left === 1 ? "" : "s"} left`}</Badge>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => doRestore(t)}>Restore</Button>
                    <Button size="sm" variant="ghost" className="!text-red-600 hover:!bg-red-50" onClick={() => setConfirmPurge(t)}>Delete forever</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={!!confirmPurge}
        onClose={() => setConfirmPurge(null)}
        title="Delete forever?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmPurge(null)}>Keep it</Button>
            <Button variant="danger" onClick={() => confirmPurge && doPurge(confirmPurge)}>Delete forever</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">
          <b className="text-ink-900">{confirmPurge?.label}</b> will be removed permanently. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title="Empty the entire bin?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmEmpty(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => {
              update((d) => purgeExpired({ ...d, trash: [] }));
              setConfirmEmpty(false);
              toast("Bin emptied", "info");
            }}>Empty everything</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">All {db.trash.length} item{db.trash.length === 1 ? "" : "s"} will be gone forever, including anything not yet expired.</p>
      </Modal>
    </div>
  );
}
