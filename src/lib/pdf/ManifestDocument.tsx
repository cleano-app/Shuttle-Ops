import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// Build spec §37: "A nightly job generates a printable PDF per departure
// for the following day: stop sequence, passengers per stop with phone
// numbers, categories, luggage counts, parcels, driver segment bounds,
// vehicle, crossing reference and check-in time... If Supabase, Vercel or
// a driver's phone is unavailable at 6am, the run still happens off
// paper." The nightly job/email itself is Phase 4 (§39); this is the
// document it will eventually attach — Phase 2 exposes it as an on-demand
// download so Office can already print one by hand today.

const DARK = "#163a54";
const BORDER_GRAY = "#E2E8F0";
const TEXT_GRAY = "#475569";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1E293B" },
  header: {
    paddingBottom: 10,
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: DARK,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: DARK },
  subtitle: { fontSize: 10, color: TEXT_GRAY, marginTop: 2 },
  crossingBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  crossingLabel: { fontSize: 8, color: TEXT_GRAY },
  crossingValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: DARK },
  segmentBar: {
    marginTop: 6,
    fontSize: 9,
    color: TEXT_GRAY,
  },
  stopBlock: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
  },
  stopHeaderRow: { flexDirection: "row", justifyContent: "space-between" },
  stopTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  stopMeta: { fontSize: 8, color: TEXT_GRAY },
  passengerRow: {
    flexDirection: "row",
    marginTop: 3,
    paddingLeft: 8,
  },
  passengerName: { width: 140, fontSize: 9 },
  passengerPhone: { width: 90, fontSize: 9, color: TEXT_GRAY },
  passengerDetail: { flex: 1, fontSize: 9, color: TEXT_GRAY },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: TEXT_GRAY,
    textAlign: "center",
  },
});

export interface ManifestPassenger {
  full_name: string;
  phone: string | null;
  category: string;
  luggage_large: number;
  luggage_small: number;
  luggage_oversize: number;
  role: "pickup" | "dropoff";
}

export interface ManifestStop {
  sequence: number;
  address_label: string;
  planned_arrival_at: string | null;
  passengers: ManifestPassenger[];
}

export interface ManifestDriverSegment {
  driver_name: string;
  vehicle_registration: string;
  from_stop_sequence: number | null;
  to_stop_sequence: number | null;
}

export interface ManifestData {
  routeName: string;
  direction: string;
  departAt: string;
  crossingReference: string | null;
  crossingCheckinDeadline: string | null;
  vehicleRegistrations: string[];
  driverSegments: ManifestDriverSegment[];
  stops: ManifestStop[];
  generatedAt: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ManifestDocument({ data }: { data: ManifestData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {data.routeName} · {data.direction}
          </Text>
          <Text style={styles.subtitle}>
            {new Date(data.departAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
          </Text>
          <Text style={styles.subtitle}>Vehicle(s): {data.vehicleRegistrations.join(", ") || "—"}</Text>
          {data.driverSegments.length > 0 && (
            <Text style={styles.segmentBar}>
              {data.driverSegments
                .map(
                  (s) =>
                    `${s.driver_name} (${s.vehicle_registration}): stop ${s.from_stop_sequence ?? "start"} → ${
                      s.to_stop_sequence ?? "end"
                    }`
                )
                .join("  ·  ")}
            </Text>
          )}
          {data.crossingReference && (
            <View style={styles.crossingBox}>
              <View>
                <Text style={styles.crossingLabel}>CROSSING REFERENCE</Text>
                <Text style={styles.crossingValue}>{data.crossingReference}</Text>
              </View>
              <View>
                <Text style={styles.crossingLabel}>CHECK-IN DEADLINE</Text>
                <Text style={styles.crossingValue}>{formatTime(data.crossingCheckinDeadline)}</Text>
              </View>
            </View>
          )}
        </View>

        {data.stops.map((stop) => (
          <View key={stop.sequence} style={styles.stopBlock} wrap={false}>
            <View style={styles.stopHeaderRow}>
              <Text style={styles.stopTitle}>
                {stop.sequence + 1}. {stop.address_label}
              </Text>
              <Text style={styles.stopMeta}>ETA {formatTime(stop.planned_arrival_at)}</Text>
            </View>
            {stop.passengers.map((p, i) => (
              <View key={i} style={styles.passengerRow}>
                <Text style={styles.passengerName}>
                  {p.role === "pickup" ? "↑" : "↓"} {p.full_name} ({p.category})
                </Text>
                <Text style={styles.passengerPhone}>{p.phone ?? ""}</Text>
                <Text style={styles.passengerDetail}>
                  {p.luggage_large + p.luggage_small} suitcases
                  {p.luggage_oversize > 0 ? `, ${p.luggage_oversize} oversize` : ""}
                </Text>
              </View>
            ))}
            {stop.passengers.length === 0 && (
              <Text style={{ ...styles.passengerDetail, paddingLeft: 8 }}>No passengers at this stop.</Text>
            )}
          </View>
        ))}

        <Text style={styles.footer}>
          Fallback manifest — generated {new Date(data.generatedAt).toLocaleString("en-GB")}. This is an estimate,
          not live traffic information.
        </Text>
      </Page>
    </Document>
  );
}
