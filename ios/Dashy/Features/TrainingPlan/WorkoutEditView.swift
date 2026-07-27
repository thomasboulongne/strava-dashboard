import SwiftUI

/// Create/edit sheet for a workout. Duration is entered as flexible text
/// ("90", "1:30", "1h30m") and parsed via `WeekDate.parseDuration`.
struct WorkoutEditView: View {
    let title: String
    let existing: TrainingWorkout?
    /// (sessionName, durationMinutes, intensity, notes, timeOfDay)
    let onSubmit: (String, Int?, String?, String?, String?) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var sessionName: String
    @State private var timeOfDay: String
    @State private var durationText: String
    @State private var intensity: String
    @State private var notes: String

    init(
        title: String,
        existing: TrainingWorkout?,
        onSubmit: @escaping (String, Int?, String?, String?, String?) -> Void
    ) {
        self.title = title
        self.existing = existing
        self.onSubmit = onSubmit
        _sessionName = State(initialValue: existing?.sessionName ?? "")
        _timeOfDay = State(initialValue: existing?.timeOfDay ?? "")
        _durationText = State(initialValue: existing?.durationTargetMinutes.map { "\($0)" } ?? "")
        _intensity = State(initialValue: existing?.intensityTarget ?? "")
        _notes = State(initialValue: existing?.notes ?? "")
    }

    private var canSave: Bool {
        !sessionName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Session name", text: $sessionName)
                    TextField("Time of day (e.g. AM)", text: $timeOfDay)
                }
                Section("Target") {
                    TextField("Duration (90, 1:30, 1h30m)", text: $durationText)
                    TextField("Intensity (e.g. Z2, Threshold)", text: $intensity)
                }
                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSubmit(
                            sessionName.trimmingCharacters(in: .whitespaces),
                            WeekDate.parseDuration(durationText),
                            trimmedOrNil(intensity),
                            trimmedOrNil(notes),
                            trimmedOrNil(timeOfDay)
                        )
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private func trimmedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }
}
