-- Paged customer history: GET /trips/mine orders by requestedAt within one customer.
CREATE INDEX "trips_customerId_requestedAt_idx" ON "trips"("customerId", "requestedAt");
