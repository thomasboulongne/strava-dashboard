import Foundation

/// Simple on-disk cache of raw API JSON payloads, the native equivalent of the
/// web client's `localStorage`-persisted React Query cache. Each endpoint
/// response is stored as a file keyed by a stable string; callers decode with
/// the shared `JSONDecoder.dashy`.
enum DiskCache {
    private static let directory: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("DashyCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private static func fileURL(_ key: String) -> URL {
        // Sanitize key into a safe filename.
        let safe = key.replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "?", with: "_")
            .replacingOccurrences(of: "=", with: "_")
        return directory.appendingPathComponent(safe).appendingPathExtension("json")
    }

    static func saveData(_ data: Data, for key: String) {
        try? data.write(to: fileURL(key), options: .atomic)
    }

    static func loadData(for key: String) -> Data? {
        try? Data(contentsOf: fileURL(key))
    }

    /// Loads and decodes a cached payload with the shared decoder.
    static func load<T: Decodable>(_ type: T.Type, for key: String) -> T? {
        guard let data = loadData(for: key) else { return nil }
        return try? JSONDecoder.dashy.decode(type, from: data)
    }

    static func remove(_ key: String) {
        try? FileManager.default.removeItem(at: fileURL(key))
    }

    /// Clears the entire cache (used on logout).
    static func clearAll() {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        for file in files { try? FileManager.default.removeItem(at: file) }
    }
}

/// Cache key constants so callers stay consistent.
enum CacheKey {
    static let athlete = "athlete"
    static let stats = "stats"
    static let activitiesPage0 = "activities-page0"
    static let analyticsActivities = "analytics-activities"
    static let analyticsZones = "analytics-zones"
    static let analyticsStreams = "analytics-streams"
    static func trainingPlan(_ week: String) -> String { "training-plan-\(week)" }
}
