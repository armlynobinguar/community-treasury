import { useState, useEffect, useCallback } from "react";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { isConnected, getAddress, signTransaction } from "@stellar/freighter-api";

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "YOUR_CONTRACT_ID";
const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NETWORK_PASS = import.meta.env.VITE_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const TREASURY_TKN = import.meta.env.VITE_TREASURY_TOKEN_ID ?? "TREASURY_TOKEN_ID";

const server = new SorobanRpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

async function simulateAndSend(sourcePublicKey, operation) {
  const account = await server.getAccount(sourcePublicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASS,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(simResult.error);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await signTransaction(preparedTx.toXDR(), {
    networkPassphrase: NETWORK_PASS,
  });

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASS);
  const response = await server.sendTransaction(signedTx);
  if (response.status === "ERROR") throw new Error(response.errorResult?.toString());

  let getResponse = await server.getTransaction(response.hash);
  while (getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((r) => setTimeout(r, 1000));
    getResponse = await server.getTransaction(response.hash);
  }
  if (getResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error("Transaction failed");
  }
  return getResponse;
}

async function readOnly(method, args = []) {
  const account = await server.getAccount(
    "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
  );
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASS,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

function stroops(amount) {
  return BigInt(Math.round(parseFloat(amount) * 1e7));
}

function fromStroops(raw) {
  return (Number(raw) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

const STATUS_META = {
  Active: { label: "ACTIVE", dot: "#22d3ee", bg: "rgba(34,211,238,.12)", text: "#22d3ee" },
  Defeated: { label: "DEFEATED", dot: "#f87171", bg: "rgba(248,113,113,.12)", text: "#f87171" },
  Queued: { label: "QUEUED", dot: "#fbbf24", bg: "rgba(251,191,36,.12)", text: "#fbbf24" },
  Executed: { label: "EXECUTED", dot: "#4ade80", bg: "rgba(74,222,128,.12)", text: "#4ade80" },
  Cancelled: { label: "CANCELLED", dot: "#94a3b8", bg: "rgba(148,163,184,.12)", text: "#94a3b8" },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.Active;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 99,
        background: m.bg,
        color: m.text,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot }} />
      {m.label}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, accent = "#22d3ee", sub }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at top left, ${accent}12 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "#64748b",
          fontFamily: "'Space Mono', monospace",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "#f1f5f9",
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: "#475569" }}>{sub}</span>}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", loading, style = {} }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 22px",
    borderRadius: 10,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    transition: "all 0.15s",
    opacity: disabled ? 0.45 : 1,
    ...style,
  };
  const variants = {
    primary: { background: "linear-gradient(135deg,#22d3ee,#818cf8)", color: "#0f172a" },
    danger: { background: "rgba(239,68,68,.15)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)" },
    ghost: { background: "rgba(255,255,255,.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,.1)" },
    success: { background: "rgba(74,222,128,.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,.3)" },
    warning: { background: "rgba(251,191,36,.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,.3)" },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ ...base, ...variants[variant] }}>
      {loading ? (
        <span
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      ) : (
        children
      )}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 12,
            color: "#64748b",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "'Space Mono', monospace",
          }}
        >
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: "10px 14px",
          color: "#f1f5f9",
          fontSize: 14,
          fontFamily: mono ? "'Space Mono', monospace" : "inherit",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 12,
            color: "#64748b",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "'Space Mono', monospace",
          }}
        >
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: "10px 14px",
          color: "#f1f5f9",
          fontSize: 14,
          resize: "vertical",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const colors = { success: "#4ade80", error: "#f87171", info: "#22d3ee" };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 9999,
        background: "#1e293b",
        border: `1px solid ${colors[type] ?? colors.info}40`,
        borderLeft: `3px solid ${colors[type] ?? colors.info}`,
        borderRadius: 12,
        padding: "14px 20px",
        color: colors[type] ?? colors.info,
        fontFamily: "'Space Mono', monospace",
        fontSize: 13,
        maxWidth: 380,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        animation: "slideUp 0.25s ease",
      }}
    >
      {msg}
    </div>
  );
}

function VoteBar({ forVotes, againstVotes, abstainVotes }) {
  const total = forVotes + againstVotes + abstainVotes;
  if (total === 0) {
    return <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99 }} />;
  }
  const forPct = (forVotes / total) * 100;
  const againstPct = (againstVotes / total) * 100;
  const abstainPct = (abstainVotes / total) * 100;
  return (
    <div>
      <div style={{ display: "flex", borderRadius: 99, overflow: "hidden", height: 6, gap: 1 }}>
        <div style={{ width: `${forPct}%`, background: "#4ade80", transition: "width 0.4s" }} />
        <div style={{ width: `${againstPct}%`, background: "#f87171", transition: "width 0.4s" }} />
        <div style={{ width: `${abstainPct}%`, background: "#64748b", transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {[
          { label: "For", pct: forPct, color: "#4ade80" },
          { label: "Against", pct: againstPct, color: "#f87171" },
          { label: "Abstain", pct: abstainPct, color: "#64748b" },
        ].map(({ label, pct, color }) => (
          <span
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "#94a3b8",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            {label} {pct.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function ProposalCard({ proposal, walletAddress, onVote, onQueue, onExecute, onCancel, loadingId }) {
  const [expanded, setExpanded] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const p = proposal;

  const canVote = p.status === "Active" && now <= Number(p.voting_deadline);
  const canQueue = p.status === "Active" && now > Number(p.voting_deadline);
  const canExecute = p.status === "Queued" && now >= Number(p.executable_at);
  const inVeto = p.status === "Queued" && now < Number(p.executable_at);
  const canCancel = p.status !== "Executed" && p.status !== "Cancelled";

  const forV = Number(p.for_votes);
  const againstV = Number(p.against_votes);
  const abstainV = Number(p.abstain_votes);
  const total = forV + againstV + abstainV;
  const quorumPct = total > 0 ? ((forV / total) * 100).toFixed(1) : "0.0";

  const isLoading = (act) => loadingId === `${p.id}-${act}`;

  return (
    <Card style={{ cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono', monospace" }}>
              #{String(p.id).padStart(3, "0")}
            </span>
            <StatusBadge status={p.status} />
            {inVeto && (
              <span
                style={{
                  fontSize: 11,
                  color: "#fbbf24",
                  fontFamily: "'Space Mono', monospace",
                  background: "rgba(251,191,36,.1)",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                VETO WINDOW
              </span>
            )}
          </div>
          <h3 style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
            {p.title}
          </h3>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#22d3ee", fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
            {fromStroops(p.amount)}
          </div>
          <div style={{ fontSize: 11, color: "#475569" }}>tokens</div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <span style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono', monospace" }}>RECIPIENT </span>
        <span
          style={{
            fontSize: 11,
            color: "#94a3b8",
            fontFamily: "'Space Mono', monospace",
            wordBreak: "break-all",
          }}
        >
          {p.recipient}
        </span>
      </div>

      {p.description && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
            fontSize: 12,
            padding: "8px 0 0",
            fontFamily: "'Space Mono', monospace",
          }}
        >
          {expanded ? "▲ hide description" : "▼ show description"}
        </button>
      )}
      {expanded && <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>{p.description}</p>}

      <div style={{ marginTop: 16 }}>
        <VoteBar forVotes={forV} againstVotes={againstV} abstainVotes={abstainV} />
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono', monospace" }}>
            QUORUM {quorumPct}% of votes
          </span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono', monospace" }}>
            DEADLINE {new Date(Number(p.voting_deadline) * 1000).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {canVote && (
          <>
            <Btn variant="success" onClick={() => onVote(p.id, "For")} loading={isLoading("vote-for")} disabled={!walletAddress}>
              For
            </Btn>
            <Btn
              variant="danger"
              onClick={() => onVote(p.id, "Against")}
              loading={isLoading("vote-against")}
              disabled={!walletAddress}
            >
              Against
            </Btn>
            <Btn variant="ghost" onClick={() => onVote(p.id, "Abstain")} loading={isLoading("vote-abstain")} disabled={!walletAddress}>
              Abstain
            </Btn>
          </>
        )}
        {canQueue && (
          <Btn variant="warning" onClick={() => onQueue(p.id)} loading={isLoading("queue")} disabled={!walletAddress}>
            Queue Proposal
          </Btn>
        )}
        {canExecute && (
          <Btn variant="success" onClick={() => onExecute(p.id)} loading={isLoading("execute")} disabled={!walletAddress}>
            Execute
          </Btn>
        )}
        {canCancel && walletAddress && (
          <Btn variant="danger" onClick={() => onCancel(p.id)} loading={isLoading("cancel")} style={{ marginLeft: "auto" }}>
            Cancel
          </Btn>
        )}
      </div>

      {p.executed_at > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#4ade80", fontFamily: "'Space Mono', monospace" }}>
          ✓ Executed {new Date(Number(p.executed_at) * 1000).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

export default function CommunityTreasury() {
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);

  const [config, setConfig] = useState(null);
  const [treasuryBal, setTreasuryBal] = useState(0n);
  const [reservedBal, setReservedBal] = useState(0n);
  const [availableBal, setAvailableBal] = useState(0n);
  const [proposals, setProposals] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [toast, setToast] = useState({ msg: "", type: "info" });
  const notify = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "info" }), 5000);
  };

  const [loadingId, setLoadingId] = useState("");
  const [panel, setPanel] = useState("proposals");
  const [depositAmt, setDepositAmt] = useState("");
  const [propTitle, setPropTitle] = useState("");
  const [propDesc, setPropDesc] = useState("");
  const [propRecipient, setPropRecipient] = useState("");
  const [propAmount, setPropAmount] = useState("");
  const [filter, setFilter] = useState("All");

  const connectWallet = async () => {
    setWalletLoading(true);
    try {
      const connected = await isConnected();
      if (!connected) {
        notify("Freighter not found. Install at freighter.app", "error");
        return;
      }
      const result = await getAddress();
      if (result.error) throw new Error(result.error);
      setWalletAddress(result.address);
      notify("Wallet connected", "success");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setWalletLoading(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress("");
    notify("Wallet disconnected", "info");
  };

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [cfg, tBal, rBal, aBal, allIds] = await Promise.all([
        readOnly("get_config"),
        readOnly("get_treasury_balance"),
        readOnly("get_reserved_balance"),
        readOnly("get_available_balance"),
        readOnly("get_all_proposals"),
      ]);

      setConfig(cfg);
      setTreasuryBal(BigInt(tBal));
      setReservedBal(BigInt(rBal));
      setAvailableBal(BigInt(aBal));

      if (allIds && allIds.length > 0) {
        const props = await Promise.all(
          allIds.map((id) => readOnly("get_proposal", [nativeToScVal(id, { type: "u64" })]))
        );
        const normalised = props.map((p) => ({
          ...p,
          status: Object.keys(p.status ?? {})[0] ?? "Active",
        }));
        setProposals([...normalised].reverse());
      } else {
        setProposals([]);
      }
    } catch (e) {
      notify(`Failed to load data: ${e.message}`, "error");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeposit = async () => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    if (!depositAmt || parseFloat(depositAmt) <= 0) return notify("Enter a valid amount", "error");
    setLoadingId("deposit");
    try {
      const amount = stroops(depositAmt);
      const sacContract = new Contract(TREASURY_TKN);
      const approveOp = sacContract.call(
        "approve",
        new Address(walletAddress).toScVal(),
        new Address(CONTRACT_ID).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
        nativeToScVal(500, { type: "u32" })
      );
      await simulateAndSend(walletAddress, approveOp);

      const depositOp = contract.call(
        "deposit",
        new Address(walletAddress).toScVal(),
        nativeToScVal(amount, { type: "i128" })
      );
      await simulateAndSend(walletAddress, depositOp);

      notify(`Deposited ${depositAmt} tokens`, "success");
      setDepositAmt("");
      await loadData();
      setPanel("proposals");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const handleSubmitProposal = async () => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    if (!propTitle || !propDesc || !propRecipient || !propAmount) return notify("Fill all fields", "error");
    setLoadingId("submit");
    try {
      const op = contract.call(
        "submit_proposal",
        new Address(walletAddress).toScVal(),
        nativeToScVal(propTitle, { type: "string" }),
        nativeToScVal(propDesc, { type: "string" }),
        new Address(propRecipient).toScVal(),
        nativeToScVal(stroops(propAmount), { type: "i128" })
      );
      await simulateAndSend(walletAddress, op);
      notify("Proposal submitted", "success");
      setPropTitle("");
      setPropDesc("");
      setPropRecipient("");
      setPropAmount("");
      await loadData();
      setPanel("proposals");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const handleVote = async (proposalId, direction) => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    const key = `${proposalId}-vote-${direction.toLowerCase()}`;
    setLoadingId(key);
    try {
      const dirScVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(direction)]);
      const op = contract.call(
        "vote",
        new Address(walletAddress).toScVal(),
        nativeToScVal(proposalId, { type: "u64" }),
        dirScVal
      );
      await simulateAndSend(walletAddress, op);
      notify(`Voted ${direction} on proposal #${String(proposalId).padStart(3, "0")}`, "success");
      await loadData();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const handleQueue = async (proposalId) => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    setLoadingId(`${proposalId}-queue`);
    try {
      const op = contract.call("queue_proposal", nativeToScVal(proposalId, { type: "u64" }));
      await simulateAndSend(walletAddress, op);
      notify(`Proposal #${String(proposalId).padStart(3, "0")} queued`, "success");
      await loadData();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const handleExecute = async (proposalId) => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    setLoadingId(`${proposalId}-execute`);
    try {
      const op = contract.call("execute_proposal", nativeToScVal(proposalId, { type: "u64" }));
      await simulateAndSend(walletAddress, op);
      notify(`Proposal #${String(proposalId).padStart(3, "0")} executed`, "success");
      await loadData();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const handleCancel = async (proposalId) => {
    if (!walletAddress) return notify("Connect wallet first", "error");
    setLoadingId(`${proposalId}-cancel`);
    try {
      const op = contract.call(
        "cancel_proposal",
        new Address(walletAddress).toScVal(),
        nativeToScVal(proposalId, { type: "u64" })
      );
      await simulateAndSend(walletAddress, op);
      notify(`Proposal #${String(proposalId).padStart(3, "0")} cancelled`, "success");
      await loadData();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setLoadingId("");
    }
  };

  const filterOptions = ["All", "Active", "Queued", "Defeated", "Executed", "Cancelled"];
  const filtered = filter === "All" ? proposals : proposals.filter((p) => p.status === filter);
  const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#090d15",
        color: "#f1f5f9",
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,300&family=Space+Mono:wght@400;700&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #334155; }
        input:focus, textarea:focus { border-color: rgba(34,211,238,.35) !important; box-shadow: 0 0 0 2px rgba(34,211,238,.1) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            top: -120,
            left: "30%",
            width: 500,
            height: 500,
            background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40%",
            right: -80,
            width: 400,
            height: 400,
            background: "radial-gradient(circle, rgba(129,140,248,0.06) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
      </div>

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(9,13,21,0.85)",
          backdropFilter: "blur(20px)",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#22d3ee,#818cf8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ◈
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: "#f1f5f9" }}>
              {config?.protocol_name ?? "Community Treasury"}
            </div>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Space Mono', monospace" }}>SOROBAN · STELLAR</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn variant="ghost" onClick={loadData} loading={dataLoading} style={{ padding: "8px 14px", fontSize: 12 }}>
            ↺ Refresh
          </Btn>
          {walletAddress ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "rgba(74,222,128,.08)",
                  border: "1px solid rgba(74,222,128,.2)",
                  color: "#4ade80",
                  fontSize: 12,
                  fontFamily: "'Space Mono', monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
                {shortAddr(walletAddress)}
              </div>
              <Btn variant="ghost" onClick={disconnectWallet} style={{ padding: "8px 12px", fontSize: 12 }}>
                ✕
              </Btn>
            </div>
          ) : (
            <Btn onClick={connectWallet} loading={walletLoading}>
              Connect Freighter
            </Btn>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 32 }}>
          <StatCard
            label="Treasury Balance"
            value={`${fromStroops(treasuryBal)}`}
            accent="#22d3ee"
            sub="Total deposited minus executed payouts"
          />
          <StatCard label="Reserved" value={`${fromStroops(reservedBal)}`} accent="#fbbf24" sub="Locked for queued proposals" />
          <StatCard label="Available" value={`${fromStroops(availableBal)}`} accent="#4ade80" sub="Proposable right now" />
        </div>

        {config && (
          <Card style={{ marginBottom: 32, padding: "16px 24px" }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {[
                { k: "QUORUM", v: `${(config.quorum_bps / 100).toFixed(0)}%` },
                { k: "VOTE WINDOW", v: `${Math.round(Number(config.voting_window) / 3600)}h` },
                { k: "VETO PERIOD", v: `${Math.round(Number(config.veto_period) / 3600)}h` },
                { k: "SPEND CAP", v: config.spending_cap > 0 ? fromStroops(config.spending_cap) : "None" },
                { k: "ADMIN", v: shortAddr(config.admin) },
              ].map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "#475569", fontFamily: "'Space Mono', monospace", letterSpacing: "0.08em" }}>
                    {k}
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[
            { id: "proposals", label: "Proposals" },
            { id: "deposit", label: "Deposit Funds" },
            { id: "submit", label: "New Proposal" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPanel(id)}
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                transition: "all 0.15s",
                background:
                  panel === id ? "linear-gradient(135deg,rgba(34,211,238,.2),rgba(129,140,248,.2))" : "rgba(255,255,255,0.04)",
                color: panel === id ? "#22d3ee" : "#64748b",
                border: panel === id ? "1px solid rgba(34,211,238,.3)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {panel === "proposals" && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {filterOptions.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 99,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    background: filter === f ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.03)",
                    color: filter === f ? "#f1f5f9" : "#475569",
                    border: filter === f ? "1px solid rgba(255,255,255,.15)" : "1px solid transparent",
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  color: "#475569",
                  alignSelf: "center",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {filtered.length} proposal{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {dataLoading && proposals.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>
                <div>Loading proposals...</div>
              </div>
            ) : filtered.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "60px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>◈</div>
                <div style={{ color: "#475569", fontSize: 14 }}>No proposals yet. Submit the first one.</div>
                <div style={{ marginTop: 16 }}>
                  <Btn onClick={() => setPanel("submit")} disabled={!walletAddress}>
                    New Proposal
                  </Btn>
                </div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filtered.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    walletAddress={walletAddress}
                    onVote={handleVote}
                    onQueue={handleQueue}
                    onExecute={handleExecute}
                    onCancel={handleCancel}
                    loadingId={loadingId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {panel === "deposit" && (
          <div style={{ animation: "fadeIn 0.2s ease", maxWidth: 480 }}>
            <Card>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Deposit Revenue</h2>
              <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                Deposit treasury tokens into the collective pool. Tokens are collectively owned - there are no individual withdrawal
                rights.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input label="Amount" value={depositAmt} onChange={setDepositAmt} placeholder="0.0000" type="number" mono />

                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(34,211,238,.06)",
                    border: "1px solid rgba(34,211,238,.15)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>
                    ESTIMATED DEPOSIT
                  </div>
                  <div style={{ fontSize: 18, color: "#22d3ee", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                    {depositAmt ? parseFloat(depositAmt).toFixed(4) : "0.0000"} tokens
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Contract will first request approve() then deposit()</div>
                </div>

                <Btn
                  onClick={handleDeposit}
                  disabled={!walletAddress || !depositAmt}
                  loading={loadingId === "deposit"}
                  style={{ width: "100%" }}
                >
                  {walletAddress ? "Deposit Tokens" : "Connect Wallet First"}
                </Btn>
              </div>
            </Card>
          </div>
        )}

        {panel === "submit" && (
          <div style={{ animation: "fadeIn 0.2s ease", maxWidth: 560 }}>
            <Card>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>Submit Spending Proposal</h2>
              <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                Propose a spend from the treasury. You must hold governance tokens to submit. The community votes - proposals passing
                quorum enter a veto window before execution.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input label="Title" value={propTitle} onChange={setPropTitle} placeholder="Q1 Developer Grants" />
                <Textarea
                  label="Description"
                  value={propDesc}
                  onChange={setPropDesc}
                  placeholder="Describe what these funds will be used for, expected outcomes, and accountability measures..."
                  rows={4}
                />
                <Input label="Recipient Address" value={propRecipient} onChange={setPropRecipient} placeholder="G..." mono />
                <Input
                  label="Amount (tokens)"
                  value={propAmount}
                  onChange={setPropAmount}
                  placeholder="0.0000"
                  type="number"
                  mono
                />

                {propAmount && propTitle && (
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "rgba(129,140,248,.06)",
                      border: "1px solid rgba(129,140,248,.15)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "#94a3b8",
                      lineHeight: 1.8,
                      fontFamily: "'Space Mono', monospace",
                    }}
                  >
                    <div>
                      <span style={{ color: "#64748b" }}>TITLE </span>
                      {propTitle}
                    </div>
                    <div>
                      <span style={{ color: "#64748b" }}>AMOUNT </span>
                      {parseFloat(propAmount).toFixed(4)} tokens
                    </div>
                    <div>
                      <span style={{ color: "#64748b" }}>RECIPIENT </span>
                      {shortAddr(propRecipient) || "-"}
                    </div>
                  </div>
                )}

                <Btn
                  onClick={handleSubmitProposal}
                  disabled={!walletAddress || !propTitle || !propDesc || !propRecipient || !propAmount}
                  loading={loadingId === "submit"}
                  style={{ width: "100%" }}
                >
                  {walletAddress ? "Submit Proposal" : "Connect Wallet First"}
                </Btn>
              </div>
            </Card>
          </div>
        )}
      </main>

      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          padding: "20px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Mono', monospace" }}>
          soroban-community-treasury · {CONTRACT_ID !== "YOUR_CONTRACT_ID" ? shortAddr(CONTRACT_ID) : "not configured"}
        </span>
        <span style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Mono', monospace" }}>STELLAR TESTNET</span>
      </footer>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
