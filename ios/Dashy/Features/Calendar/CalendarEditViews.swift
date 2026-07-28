import SwiftUI

// Shared option lists, mirroring the backend/web enums.
private let objectiveTypes = ["race", "test", "milestone", "camp", "note"]
private let priorities = ["A", "B", "C"]
private let blockTypes = ["base", "build", "peak", "taper", "recovery", "race"]

// MARK: - Objective edit

struct ObjectiveEditView: View {
    struct Fields {
        let title: String
        let objectiveType: String
        let startDate: String
        let endDate: String?
        let priority: String?
        let notes: String?
    }

    let existing: Objective?
    let onSave: (Fields) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var objectiveType: String
    @State private var priority: String // "" = none
    @State private var startDate: Date
    @State private var hasEndDate: Bool
    @State private var endDate: Date
    @State private var notes: String

    init(existing: Objective?, onSave: @escaping (Fields) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _title = State(initialValue: existing?.title ?? "")
        _objectiveType = State(initialValue: existing?.objectiveType ?? "race")
        _priority = State(initialValue: existing?.priority ?? "")
        _startDate = State(initialValue: WeekDate.parseYMD(existing?.startDate ?? "") ?? Date())
        _hasEndDate = State(initialValue: existing?.endDate != nil)
        _endDate = State(initialValue: WeekDate.parseYMD(existing?.endDate ?? existing?.startDate ?? "") ?? Date())
        _notes = State(initialValue: existing?.notes ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    Picker("Type", selection: $objectiveType) {
                        ForEach(objectiveTypes, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                    Picker("Priority", selection: $priority) {
                        Text("—").tag("")
                        ForEach(priorities, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    Toggle("Multi-day", isOn: $hasEndDate)
                    if hasEndDate {
                        DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
                    }
                }
                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...5)
                }
            }
            .navigationTitle(existing == nil ? "New objective" : "Edit objective")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(Fields(
                            title: title.trimmingCharacters(in: .whitespaces),
                            objectiveType: objectiveType,
                            startDate: WeekDate.formatYMD(startDate),
                            endDate: hasEndDate ? WeekDate.formatYMD(endDate) : nil,
                            priority: priority.isEmpty ? nil : priority,
                            notes: notes.trimmingCharacters(in: .whitespaces).isEmpty ? nil : notes
                        ))
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

// MARK: - Macro plan edit

struct PlanEditView: View {
    struct Fields {
        let name: String
        let startDate: String
        let endDate: String
        let goal: String?
        let goalObjectiveId: Int?
        let isActive: Bool
        let notes: String?
    }

    let existing: MacroPlan?
    let objectives: [Objective]
    let onSave: (Fields) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var goal: String
    @State private var goalObjectiveId: Int // 0 = none
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var isActive: Bool

    init(existing: MacroPlan?, objectives: [Objective], onSave: @escaping (Fields) -> Void) {
        self.existing = existing
        self.objectives = objectives
        self.onSave = onSave
        _name = State(initialValue: existing?.name ?? "")
        _goal = State(initialValue: existing?.goal ?? "")
        _goalObjectiveId = State(initialValue: existing?.goalObjectiveId ?? 0)
        _startDate = State(initialValue: WeekDate.parseYMD(existing?.startDate ?? "") ?? Date())
        _endDate = State(initialValue: WeekDate.parseYMD(existing?.endDate ?? "") ?? Date())
        _isActive = State(initialValue: existing?.isActive ?? true)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Goal", text: $goal)
                }
                Section {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
                Section {
                    Picker("Goal objective", selection: $goalObjectiveId) {
                        Text("—").tag(0)
                        ForEach(objectives) { o in
                            Text(o.title).tag(o.id)
                        }
                    }
                    Toggle("Active plan", isOn: $isActive)
                }
            }
            .navigationTitle(existing == nil ? "New plan" : "Edit plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(Fields(
                            name: name.trimmingCharacters(in: .whitespaces),
                            startDate: WeekDate.formatYMD(startDate),
                            endDate: WeekDate.formatYMD(endDate),
                            goal: goal.trimmingCharacters(in: .whitespaces).isEmpty ? nil : goal,
                            goalObjectiveId: goalObjectiveId == 0 ? nil : goalObjectiveId,
                            isActive: isActive,
                            notes: existing?.notes
                        ))
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

// MARK: - Training block edit

struct BlockEditView: View {
    struct Fields {
        let name: String
        let blockType: String
        let startDate: String
        let endDate: String
        let focus: String?
    }

    let existing: TrainingBlock?
    /// Called with the edited fields, or `deleted: true` to remove the block.
    let onSave: (Fields, Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var blockType: String
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var focus: String
    @State private var showDeleteConfirm = false

    init(existing: TrainingBlock?, onSave: @escaping (Fields, Bool) -> Void) {
        self.existing = existing
        self.onSave = onSave
        _name = State(initialValue: existing?.name ?? "")
        _blockType = State(initialValue: existing?.blockType ?? "base")
        _startDate = State(initialValue: WeekDate.parseYMD(existing?.startDate ?? "") ?? Date())
        _endDate = State(initialValue: WeekDate.parseYMD(existing?.endDate ?? "") ?? Date())
        _focus = State(initialValue: existing?.focus ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    Picker("Type", selection: $blockType) {
                        ForEach(blockTypes, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                }
                Section {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
                Section("Focus") {
                    TextField("What to emphasize", text: $focus, axis: .vertical).lineLimit(2...5)
                }
                if existing != nil {
                    Section {
                        Button("Delete block", role: .destructive) {
                            showDeleteConfirm = true
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "New block" : "Edit block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(Fields(
                            name: name.trimmingCharacters(in: .whitespaces),
                            blockType: blockType,
                            startDate: WeekDate.formatYMD(startDate),
                            endDate: WeekDate.formatYMD(endDate),
                            focus: focus.trimmingCharacters(in: .whitespaces).isEmpty ? nil : focus
                        ), false)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("Delete this block?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    onSave(Fields(name: name, blockType: blockType, startDate: "", endDate: "", focus: nil), true)
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
