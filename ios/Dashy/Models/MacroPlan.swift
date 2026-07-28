import Foundation

/// A periodization phase inside a macro plan (base, build, peak, taper,
/// recovery, race). Mirrors `TrainingBlock` in src/lib/strava-types.ts.
struct TrainingBlock: Decodable, Identifiable, Equatable {
    let id: Int
    let macroPlanId: Int
    let name: String
    let blockType: String // base | build | peak | taper | recovery | race
    let startDate: String // YYYY-MM-DD
    let endDate: String    // YYYY-MM-DD
    let focus: String?
    let color: String?
    let blockOrder: Int
}

/// A named periodization plan (season) holding an ordered set of training
/// blocks. Mirrors `MacroPlan` in src/lib/strava-types.ts. `blocks` is present
/// on single-plan / active-plan responses only.
struct MacroPlan: Decodable, Identifiable, Equatable {
    let id: Int
    let name: String
    let goal: String?
    let goalObjectiveId: Int?
    let startDate: String // YYYY-MM-DD
    let endDate: String    // YYYY-MM-DD
    let isActive: Bool
    let notes: String?
    let blocks: [TrainingBlock]?
}

struct MacroPlansResponse: Decodable {
    let plans: [MacroPlan]
}

struct MacroPlanResponse: Decodable {
    let plan: MacroPlan?
}
