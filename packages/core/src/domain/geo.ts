export interface GeoCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Calculates the great-circle distance between two WGS84 coordinates in metres. */
export function calculateDistanceMeters(from: GeoCoordinates, to: GeoCoordinates): number {
  const radians = (value: number): number => (value * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, arc))));
}
