-- AlterTable
ALTER TABLE "service_zones" ADD COLUMN     "geom" geography(Polygon, 4326);


-- Spatial index for point-in-polygon lookups
CREATE INDEX "service_zones_geom_idx" ON "service_zones" USING GIST ("geom");
