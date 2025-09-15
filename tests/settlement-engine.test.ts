import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_SETTLED = 200;
const ERR_ALREADY_SETTLED = 201;
const ERR_INVALID_RIDE_ID = 202;
const ERR_INSUFFICIENT_FUNDS = 203;
const ERR_UNVERIFIED_COMPLETION = 204;
const ERR_INVALID_ORACLE = 205;
const ERR_PARTICIPANT_NOT_FOUND = 206;
const ERR_REFUND_FAILED = 208;
const ERR_SETTLEMENT_FEE = 210;

interface Ride {
  rideId: number;
  totalFare: number;
  participants: string[];
  shares: number[];
  escrowBalance: number;
  status: string;
  timestamp: number;
  driver: string;
}

interface Settlement {
  settlementId: number;
  distributed: number;
  penalties: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class SettlementEngineMock {
  state: {
    settlementFee: number;
    oraclePrincipal: string;
    nextSettlementId: number;
    rides: Map<number, Ride>;
    settlements: Map<number, Settlement>;
  } = {
    settlementFee: 50,
    oraclePrincipal: "ST1TEST",
    nextSettlementId: 0,
    rides: new Map(),
    settlements: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  deployer: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      settlementFee: 50,
      oraclePrincipal: "ST1TEST",
      nextSettlementId: 0,
      rides: new Map(),
      settlements: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.deployer = "ST1TEST";
    this.stxTransfers = [];
  }

  getRide(rideId: number): Ride | null {
    return this.state.rides.get(rideId) || null;
  }

  getSettlement(settlementId: number): Settlement | null {
    return this.state.settlements.get(settlementId) || null;
  }

  calculateShare(totalFare: number, participantShare: number): number {
    return Math.floor((totalFare * participantShare) / 100);
  }

  validateOracle(sender: string): Result<boolean> {
    if (sender !== this.state.oraclePrincipal) return { ok: false, value: false };
    return { ok: true, value: true };
  }

  validateRideExists(rideId: number): Result<boolean> {
    if (!this.state.rides.has(rideId)) return { ok: false, value: false };
    return { ok: true, value: true };
  }

  validateNotSettled(rideId: number): Result<boolean> {
    const ride = this.state.rides.get(rideId);
    if (!ride || ride.status === "settled") return { ok: false, value: false };
    return { ok: true, value: true };
  }

  validateCompletion(rideId: number, completed: boolean): Result<boolean> {
    if (!completed) return { ok: false, value: false };
    return { ok: true, value: true };
  }

  applyPenalties(ride: Ride): Result<number> {
    const totalPenalty = Math.floor(ride.escrowBalance / 20);
    if (totalPenalty > 0) {
      return { ok: true, value: totalPenalty };
    }
    return { ok: true, value: 0 };
  }

  distributeFunds(rideId: number, ride: Ride): Result<number> {
    const fee = this.state.settlementFee;
    const netBalance = ride.escrowBalance - fee;
    if (netBalance < 0) return { ok: false, value: 0 };
    let distributed = 0;
    const totalShares = ride.shares.reduce((a, b) => a + b, 0);
    ride.shares.forEach((share, index) => {
      const participant = ride.participants[index];
      if (!participant) return;
      const shareAmount = Math.floor((netBalance * share) / totalShares);
      this.stxTransfers.push({ amount: shareAmount, from: this.caller, to: participant });
      distributed += shareAmount;
    });
    return { ok: true, value: distributed };
  }

  verifyCompletion(rideId: number, completed: boolean): Result<boolean> {
    if (!this.validateOracle(this.caller).value) return { ok: false, value: false };
    if (!this.validateRideExists(rideId).value) return { ok: false, value: false };
    if (!this.validateCompletion(rideId, completed).value) return { ok: false, value: false };
    const ride = this.state.rides.get(rideId)!;
    this.state.rides.set(rideId, { ...ride, status: completed ? "completed" : "cancelled" });
    return { ok: true, value: true };
  }

  settleRide(rideId: number): Result<{ distributed: number; penalties: number }> {
    if (!this.validateRideExists(rideId).value) return { ok: false, value: { distributed: 0, penalties: 0 } };
    if (!this.validateNotSettled(rideId).value) return { ok: false, value: { distributed: 0, penalties: 0 } };
    const ride = this.state.rides.get(rideId)!;
    if (ride.status !== "completed") return { ok: false, value: { distributed: 0, penalties: 0 } };
    const penaltiesResult = this.applyPenalties(ride);
    if (!penaltiesResult.ok) return { ok: false, value: { distributed: 0, penalties: 0 } };
    const distributedResult = this.distributeFunds(rideId, ride);
    if (!distributedResult.ok) return { ok: false, value: { distributed: 0, penalties: 0 } };
    const nextId = this.state.nextSettlementId;
    this.state.settlements.set(nextId, {
      settlementId: nextId,
      distributed: distributedResult.value,
      penalties: penaltiesResult.value,
      timestamp: this.blockHeight,
    });
    this.state.rides.set(rideId, { ...ride, status: "settled" });
    this.state.nextSettlementId++;
    return { ok: true, value: { distributed: distributedResult.value, penalties: penaltiesResult.value } };
  }

  refundParticipants(rideId: number): Result<boolean> {
    if (!this.validateRideExists(rideId).value) return { ok: false, value: false };
    const ride = this.state.rides.get(rideId)!;
    if (!["cancelled", "pending"].includes(ride.status)) return { ok: false, value: false };
    let totalRefunded = 0;
    const numParticipants = ride.participants.length;
    if (numParticipants === 0) return { ok: false, value: false };
    const share = Math.floor(ride.escrowBalance / numParticipants);
    ride.participants.forEach(participant => {
      this.stxTransfers.push({ amount: share, from: this.caller, to: participant });
      totalRefunded += share;
    });
    this.state.rides.set(rideId, { ...ride, status: "refunded" });
    return { ok: true, value: true };
  }

  setSettlementFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal) return { ok: false, value: false };
    if (newFee > 100) return { ok: false, value: false };
    this.state.settlementFee = newFee;
    return { ok: true, value: true };
  }

  setOracle(newOracle: string): Result<boolean> {
    if (this.caller !== this.deployer) return { ok: false, value: false };
    this.state.oraclePrincipal = newOracle;
    return { ok: true, value: true };
  }
}

describe("SettlementEngine", () => {
  let contract: SettlementEngineMock;

  beforeEach(() => {
    contract = new SettlementEngineMock();
    contract.reset();
    contract.state.rides.set(1, {
      rideId: 1,
      totalFare: 1000,
      participants: ["ST2TEST", "ST3TEST"],
      shares: [50, 50],
      escrowBalance: 1000,
      status: "completed",
      timestamp: 1,
      driver: "ST1TEST",
    });
  });

  it("verifies completion successfully", () => {
    const result = contract.verifyCompletion(1, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const ride = contract.getRide(1);
    expect(ride?.status).toBe("completed");
  });

  it("rejects unverified completion", () => {
    const result = contract.verifyCompletion(1, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects invalid oracle for verification", () => {
    contract.caller = "ST4FAKE";
    const result = contract.verifyCompletion(1, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("settles ride successfully", () => {
    const result = contract.settleRide(1);
    expect(result.ok).toBe(true);
    expect(result.value.distributed).toBe(950);
    expect(result.value.penalties).toBe(50);
    const settlement = contract.getSettlement(0);
    expect(settlement?.distributed).toBe(950);
    expect(settlement?.penalties).toBe(50);
    const ride = contract.getRide(1);
    expect(ride?.status).toBe("settled");
    expect(contract.stxTransfers.length).toBe(2);
    expect(contract.stxTransfers[0].amount).toBe(475);
    expect(contract.stxTransfers[1].amount).toBe(475);
  });

  it("rejects settlement for invalid ride id", () => {
    const result = contract.settleRide(999);
    expect(result.ok).toBe(false);
    expect(result.value).toStrictEqual({ distributed: 0, penalties: 0 });
  });

  it("rejects already settled ride", () => {
    contract.settleRide(1);
    const result = contract.settleRide(1);
    expect(result.ok).toBe(false);
    expect(result.value).toStrictEqual({ distributed: 0, penalties: 0 });
  });

  it("rejects settlement for not completed ride", () => {
    contract.state.rides.set(1, { ...contract.getRide(1)!, status: "pending" });
    const result = contract.settleRide(1);
    expect(result.ok).toBe(false);
    expect(result.value).toStrictEqual({ distributed: 0, penalties: 0 });
  });

  it("refunds participants successfully", () => {
    contract.state.rides.set(1, { ...contract.getRide(1)!, status: "cancelled", escrowBalance: 1000 });
    const result = contract.refundParticipants(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.stxTransfers.length).toBe(2);
    expect(contract.stxTransfers[0].amount).toBe(500);
    expect(contract.stxTransfers[1].amount).toBe(500);
    const ride = contract.getRide(1);
    expect(ride?.status).toBe("refunded");
  });

  it("rejects refund for settled ride", () => {
    const result = contract.refundParticipants(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets settlement fee successfully", () => {
    const result = contract.setSettlementFee(100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.settlementFee).toBe(100);
  });

  it("rejects invalid settlement fee", () => {
    const result = contract.setSettlementFee(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects fee set by non-oracle", () => {
    contract.caller = "ST4FAKE";
    const result = contract.setSettlementFee(75);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets oracle successfully", () => {
    const result = contract.setOracle("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oraclePrincipal).toBe("ST2TEST");
  });

  it("rejects oracle set by non-deployer", () => {
    contract.caller = "ST4FAKE";
    const result = contract.setOracle("ST2TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("calculates share correctly", () => {
    const share = contract.calculateShare(1000, 50);
    expect(share).toBe(500);
  });

  it("handles penalties correctly", () => {
    const ride: Ride = { rideId: 1, totalFare: 1000, participants: ["ST2TEST"], shares: [100], escrowBalance: 1000, status: "completed", timestamp: 1, driver: "ST1TEST" };
    const result = contract.applyPenalties(ride);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(50);
  });

  it("rejects insufficient funds in distribution", () => {
    contract.state.rides.set(1, { ...contract.getRide(1)!, escrowBalance: 10 });
    const result = contract.settleRide(1);
    expect(result.ok).toBe(false);
    expect(result.value).toStrictEqual({ distributed: 0, penalties: 0 });
  });
});