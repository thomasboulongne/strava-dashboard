import Foundation

/// A key dated goal on the athlete's calendar (race, test, milestone, camp,
/// note). Mirrors the `Objective` shape in src/lib/strava-types.ts. Decoded with
/// the shared `.convertFromSnakeCase` strategy so snake_case fields map here.
/// `id` is a SERIAL integer (returned as a JSON number, not a bigint string).
struct Objective: Decodable, Identifiable, Equatable {
    let id: Int
    let title: String
    let objectiveType: String // race | test | milestone | camp | note
    let priority: String?     // A | B | C | nil
    let startDate: String     // YYYY-MM-DD
    let endDate: String?      // YYYY-MM-DD, nil = single day
    let notes: String?
}

struct ObjectivesResponse: Decodable {
    let objectives: [Objective]
}
