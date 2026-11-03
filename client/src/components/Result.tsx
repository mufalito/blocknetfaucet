import type { DripOk } from "../api";
import CopyBtn from "./CopyBtn";

export type DripOutcome = DripOk | { error: string };

/** Result box (port of templates/frags/result.html). */
export default function Result({ result }: { result: DripOutcome }) {
  if ("error" in result) {
    return <div className="f-err">{result.error}</div>;
  }
  return (
    <div className="f-ok">
      {result.message}
      <span className="f-txid">
        txid: {result.txid}
        <a
          className="transition-colors hover:text-gold-300"
          href={`https://explorer.blocknetcrypto.com/tx/${result.txid}`}
          target="_blank"
          rel="noopener"
        >
          explorer ↗
        </a>
        <CopyBtn text={result.txid} title="Copy txid" className="ml-1" />
        {result.address ? <CopyBtn text={result.address} title="Copy address" label="copy addr" className="ml-1" /> : null}
      </span>
    </div>
  );
}
