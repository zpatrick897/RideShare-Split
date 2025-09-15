(define-constant ERR-NOT-SETTLED u200)
(define-constant ERR-ALREADY-SETTLED u201)
(define-constant ERR-INVALID-RIDE-ID u202)
(define-constant ERR-INSUFFICIENT-FUNDS u203)
(define-constant ERR-UNVERIFIED-COMPLETION u204)
(define-constant ERR-INVALID-ORACLE u205)
(define-constant ERR-PARTICIPANT-NOT-FOUND u206)
(define-constant ERR-INVALID-SHARE u207)
(define-constant ERR-REFUND-FAILED u208)
(define-constant ERR-PENALTY-APPLIED u209)
(define-constant ERR-SETTLEMENT-FEE u210)

(define-data-var settlement-fee uint u50)
(define-data-var oracle-principal principal tx-sender)
(define-data-var next-settlement-id uint u0)

(define-map rides
  uint
  {
    ride-id: uint,
    total-fare: uint,
    participants: (list 50 principal),
    shares: (list 50 uint),
    escrow-balance: uint,
    status: (string-ascii 20),
    timestamp: uint,
    driver: principal
  }
)

(define-map settlements
  uint
  {
    settlement-id: uint,
    ride-id: uint,
    distributed: uint,
    penalties: uint,
    timestamp: uint
  }
)

(define-read-only (get-ride (ride-id uint))
  (map-get? rides ride-id)
)

(define-read-only (get-settlement (settlement-id uint))
  (map-get? settlements settlement-id)
)

(define-read-only (calculate-share (total-fare uint) (participant-share uint))
  (/ (* total-fare participant-share) u100)
)

(define-private (validate-oracle (sender principal))
  (asserts! (is-eq sender (var-get oracle-principal)) (err ERR-INVALID-ORACLE))
  (ok true)
)

(define-private (validate-ride-exists (ride-id uint))
  (asserts! (is-some (map-get? rides ride-id)) (err ERR-INVALID-RIDE-ID))
  (ok true)
)

(define-private (validate-not-settled (ride-id uint))
  (let ((ride (unwrap! (map-get? rides ride-id) (err ERR-INVALID-RIDE-ID))))
    (asserts! (not (is-eq (get status ride) "settled")) (err ERR-ALREADY-SETTLED))
    (ok true)
  )
)

(define-private (validate-completion (ride-id uint) (completed bool))
  (if completed
      (ok true)
      (err ERR-UNVERIFIED-COMPLETION))
)

(define-private (apply-penalties (ride (tuple (escrow-balance uint) (participants (list 50 principal)) (shares (list 50 uint)))))
  (let ((total-penalty (/ (get escrow-balance ride) u20)))
    (if (> total-penalty u0)
        (begin
          (print { penalties: total-penalty })
          (ok total-penalty)
        )
        (ok u0)
    )
  )
)

(define-private (distribute-funds (ride-id uint) (ride (tuple (total-fare uint) (escrow-balance uint) (participants (list 50 principal)) (shares (list 50 uint)) (driver principal))))
  (let (
        (total-shares (fold + (get shares ride) u0))
        (fee (var-get settlement-fee))
        (net-balance (- (get escrow-balance ride) fee))
        (participants (get participants ride))
        (shares (get shares ride))
      )
    (asserts! (>= net-balance u0) (err ERR-INSUFFICIENT-FUNDS))
    (fold
      (lambda (participant share acc)
        (let ((share-amount (/ (* net-balance share) total-shares)))
          (try! (stx-transfer? share-amount tx-sender participant))
          (+ acc share-amount)
        )
      )
      participants
      shares
      u0
    )
  )
)

(define-public (verify-completion (ride-id uint) (completed bool))
  (begin
    (try! (validate-oracle tx-sender))
    (try! (validate-ride-exists ride-id))
    (try! (validate-completion ride-id completed))
    (let ((ride (unwrap! (map-get? rides ride-id) (err ERR-INVALID-RIDE-ID))))
      (map-set rides ride-id
        (merge ride { status: (if completed "completed" "cancelled") })
      )
      (ok true)
    )
  )
)

(define-public (settle-ride (ride-id uint))
  (let (
        (ride-opt (map-get? rides ride-id))
        (ride (unwrap! ride-opt (err ERR-INVALID-RIDE-ID)))
      )
    (try! (validate-ride-exists ride-id))
    (try! (validate-not-settled ride-id))
    (asserts! (is-eq (get status ride) "completed") (err ERR-NOT-SETTLED))
    (let (
          (penalties (try! (apply-penalties ride)))
          (distributed (try! (distribute-funds ride-id ride)))
          (next-id (var-get next-settlement-id))
        )
      (map-set settlements next-id
        {
          settlement-id: next-id,
          ride-id: ride-id,
          distributed: distributed,
          penalties: penalties,
          timestamp: block-height
        }
      )
      (map-set rides ride-id (merge ride { status: "settled" }))
      (var-set next-settlement-id (+ next-id u1))
      (print { event: "ride-settled", id: ride-id })
      (ok { distributed: distributed, penalties: penalties })
    )
  )
)

(define-public (refund-participants (ride-id uint))
  (let (
        (ride-opt (map-get? rides ride-id))
        (ride (unwrap! ride-opt (err ERR-INVALID-RIDE-ID)))
        (participants (get participants ride))
      )
    (try! (validate-ride-exists ride-id))
    (asserts! (or (is-eq (get status ride) "cancelled") (is-eq (get status ride) "pending")) (err ERR-NOT-SETTLED))
    (let ((share (/ (get escrow-balance ride) (len participants))))
      (fold
        (lambda (participant acc)
          (try! (stx-transfer? share tx-sender participant))
          (+ acc share)
        )
        participants
        u0
      )
      (map-set rides ride-id (merge ride { status: "refunded" }))
      (ok true)
    )
  )
)

(define-public (set-settlement-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get oracle-principal)) (err ERR-INVALID-ORACLE))
    (asserts! (<= new-fee u100) (err ERR-SETTLEMENT-FEE))
    (var-set settlement-fee new-fee)
    (ok true)
  )
)

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender contract-caller) (err ERR-INVALID-ORACLE))
    (var-set oracle-principal new-oracle)
    (ok true)
  )
)