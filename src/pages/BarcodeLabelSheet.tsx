import { useApp } from "../App";
import type { Product } from "../types";
import { code39 } from "../lib/barcode";
import { printIsolated } from "../lib/print";
import { fmtMoney } from "../lib/helpers";
import { Button, Modal } from "../ui";
import { IcPrint } from "../icons";

function BarcodeSvg({ value, height = 34 }: { value: string; height?: number }) {
  const spec = code39(value, 1.4, 3.6, 8);
  return (
    <svg viewBox={`0 0 ${spec.width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="block">
      {spec.bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#111" />
      ))}
    </svg>
  );
}

/** A4 sheet of barcode labels for the chosen products (prints via print isolation). */
export function BarcodeLabelSheet({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const { db } = useApp();
  const cur = db.settings.currency;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Barcode labels — ${products.length} product${products.length === 1 ? "" : "s"}`}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => printIsolated("label-sheet-print", "labels-printing")}><IcPrint size={15} /> Print sheet (A4)</Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-ink-500">
        Standard address-label grid (3 × 8 per A4). Print on sticker paper, cut and stick on products.
      </p>
      <div
        id="label-sheet-print"
        className="mx-auto rounded-xl bg-white p-6 shadow-card"
        style={{ width: 560 }}
      >
        <div className="grid grid-cols-3 gap-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-lg border border-ink-300 p-2">
              <p className="truncate text-[10px] font-bold text-ink-900">{p.name}</p>
              <p className="text-[9px] text-ink-500">{p.sku}</p>
              <BarcodeSvg value={p.barcode || p.sku} />
              <p className="text-center text-[9px] tracking-widest text-ink-700">{(p.barcode || p.sku).toUpperCase()}</p>
              <p className="text-center text-[10px] font-bold" style={{ color: "#1f6a4c" }}>{fmtMoney(p.price, cur)}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
