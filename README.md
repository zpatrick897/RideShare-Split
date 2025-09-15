# 🚗 RideShare Split: Blockchain-Powered Fare Sharing

Welcome to RideShare Split, the decentralized solution revolutionizing shared rides! Built on the Stacks blockchain with Clarity smart contracts, this project automates fare splitting, escrow payments, and settlements for carpooling, Uber Pool alternatives, or group taxis—eliminating trust issues, manual Venmo chases, and disputes in real-world ride-sharing.

## ✨ Features

🚀 **Create Shared Rides**: Riders or drivers initiate a ride with route details and estimated total fare  
👥 **Seamless Participant Joining**: Others join via invite codes or public listings, with auto-fare calculation  
💰 **Escrow Payments**: Funds locked in smart contract until ride completion—no upfront trust required  
⚖️ **Auto-Fare Splitting**: Proportional splits based on distance, seats, or custom rules, settled instantly  
🔍 **Dispute Resolution**: On-chain voting or oracle integration for fair arbitration  
✅ **Instant Refunds & Verifications**: Cancellations trigger refunds; GPS oracles confirm ride completion  
📊 **Transparency Dashboard**: View ride history, splits, and payments on the blockchain  

## 🛠 How It Works

**For Ride Creators (Drivers or Organizers)**

- Deploy a new ride via the `create-ride` contract: Input route, total estimated fare, split rules (e.g., per mile or flat), and max participants  
- Generate an invite code or make it public for others to join  
- Receive escrowed funds as participants pay in—funds held until settlement  

**For Participants (Riders)**

- Browse or join rides using `join-ride` with your wallet  
- Pay your estimated share into escrow via `deposit-fare`—calculated automatically based on your segment  
- After ride ends (confirmed by oracle or manual trigger), get your exact share settled to your wallet  
- If issues arise, initiate a dispute with evidence for community resolution  

**For Settlement & Verification**

- Use `settle-ride` to trigger auto-payouts once completion is verified (e.g., via integrated GPS data)  
- Check `get-ride-status` for real-time updates on balances, participants, and splits  
- Refunds via `cancel-participation` if you drop out early—prorated and automatic  

Powered by 8 Clarity smart contracts for robust, gas-efficient operations:  
1. **UserRegistry**: Onboard users with KYC-lite profiles.  
2. **RideFactory**: Creates and lists new rides.  
3. **ParticipantManager**: Handles joins, exits, and role assignments.  
4. **FareCalculator**: Computes dynamic splits using route math.  
5. **EscrowVault**: Locks and manages payments securely.  
6. **SettlementEngine**: Automates payouts post-ride.  
7. **DisputeResolver**: Manages votes and oracle feeds for conflicts.  
8. **OracleIntegrator**: Fetches off-chain data like GPS for verification.  

Boom! Fair, frictionless fare splitting on the blockchain—deploy on Stacks testnet and start sharing rides today.