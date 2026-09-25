import type { BinderSlot } from "@/lib/binders";
import type { SlotInsertAnimation } from "@/lib/slot-insert";
import { BinderSlotCell } from "@/components/BinderSlotCell";

export function BinderPageGrid({
  cols,
  slots,
  onSlotClick,
  onAddToWishlist,
  wishlistPendingSlotId,
  insertAnimation,
  onInsertComplete,
}: {
  cols: number;
  slots: BinderSlot[];
  onSlotClick: (slot: BinderSlot) => void;
  onAddToWishlist?: (slot: BinderSlot) => void;
  wishlistPendingSlotId?: string | null;
  insertAnimation?: SlotInsertAnimation | null;
  onInsertComplete?: () => void;
}) {
  return (
    <div
      className="grid gap-2.5 rounded-[var(--radius-xl)] border border-border bg-surface p-3 shadow-sm sm:gap-4 sm:p-5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {slots.map((slot) => (
        <BinderSlotCell
          key={slot.id}
          slot={slot}
          onClick={() => onSlotClick(slot)}
          onAddToWishlist={onAddToWishlist}
          wishlistPending={wishlistPendingSlotId === slot.id}
          insertAnimation={insertAnimation}
          onInsertComplete={
            insertAnimation?.slotId === slot.id ? onInsertComplete : undefined
          }
        />
      ))}
    </div>
  );
}
