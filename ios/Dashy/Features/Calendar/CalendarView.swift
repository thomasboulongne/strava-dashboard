import SwiftUI

/// The Calendar tab: the athlete's objectives plus the active macro plan and
/// its training blocks. Native counterpart of the web `/calendar` page.
struct CalendarView: View {
    @EnvironmentObject private var refresh: RefreshCenter
    @StateObject private var viewModel = CalendarViewModel()

    @State private var objectiveSheet: ObjectiveSheet?
    @State private var planSheet: PlanSheet?
    @State private var blockSheet: BlockSheet?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if viewModel.isLoading && viewModel.objectives.isEmpty && viewModel.activePlan == nil {
                        ProgressView().padding(.top, 40).frame(maxWidth: .infinity)
                    } else if let error = viewModel.errorMessage,
                              viewModel.objectives.isEmpty && viewModel.activePlan == nil {
                        ContentUnavailableView {
                            Label("Couldn't load calendar", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") { Task { await viewModel.refresh(refresh, showBanner: true) } }
                        }
                        .padding(.top, 40)
                    } else {
                        planSection
                        objectivesSection
                    }
                }
                .padding()
            }
            .navigationTitle("Calendar")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            objectiveSheet = ObjectiveSheet(objective: nil)
                        } label: {
                            Label("New objective", systemImage: "flag")
                        }
                        Button {
                            planSheet = PlanSheet(plan: nil)
                        } label: {
                            Label("New plan", systemImage: "calendar.badge.plus")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable { await viewModel.refresh(refresh, showBanner: false) }
            .task { await viewModel.start(refresh) }
            .onChange(of: refresh.refreshToken) {
                Task { await viewModel.refresh(refresh, showBanner: true) }
            }
            .sheet(item: $objectiveSheet) { sheet in
                ObjectiveEditView(existing: sheet.objective) { fields in
                    Task {
                        await viewModel.saveObjective(
                            id: sheet.objective?.id,
                            title: fields.title,
                            objectiveType: fields.objectiveType,
                            startDate: fields.startDate,
                            endDate: fields.endDate,
                            priority: fields.priority,
                            notes: fields.notes
                        )
                    }
                }
            }
            .sheet(item: $planSheet) { sheet in
                PlanEditView(existing: sheet.plan, objectives: viewModel.objectives) { fields in
                    Task {
                        await viewModel.savePlan(
                            id: sheet.plan?.id,
                            name: fields.name,
                            startDate: fields.startDate,
                            endDate: fields.endDate,
                            goal: fields.goal,
                            goalObjectiveId: fields.goalObjectiveId,
                            isActive: fields.isActive,
                            notes: fields.notes
                        )
                    }
                }
            }
            .sheet(item: $blockSheet) { sheet in
                BlockEditView(existing: sheet.block) { fields, deleted in
                    Task {
                        if deleted, let id = sheet.block?.id {
                            await viewModel.deleteBlock(id: id)
                        } else {
                            await viewModel.saveBlock(
                                id: sheet.block?.id,
                                planId: sheet.planId,
                                name: fields.name,
                                blockType: fields.blockType,
                                startDate: fields.startDate,
                                endDate: fields.endDate,
                                focus: fields.focus
                            )
                        }
                    }
                }
            }
        }
    }

    // MARK: - Macro plan section

    @ViewBuilder
    private var planSection: some View {
        if let plan = viewModel.activePlan {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(plan.name).font(.title3.bold())
                            Text("Active")
                                .font(.caption2.bold())
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.green.opacity(0.2))
                                .foregroundStyle(.green)
                                .clipShape(Capsule())
                        }
                        Text(CalendarDate.range(plan.startDate, plan.endDate))
                            .font(.caption).foregroundStyle(.secondary)
                        if let goal = plan.goal, !goal.isEmpty {
                            Text("Goal: \(goal)").font(.caption)
                        }
                    }
                    Spacer()
                    Menu {
                        Button {
                            blockSheet = BlockSheet(planId: plan.id, block: nil)
                        } label: { Label("Add block", systemImage: "plus") }
                        Button {
                            planSheet = PlanSheet(plan: plan)
                        } label: { Label("Edit plan", systemImage: "pencil") }
                        Button(role: .destructive) {
                            Task { await viewModel.deletePlan(id: plan.id) }
                        } label: { Label("Delete plan", systemImage: "trash") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }

                TimelineBar(plan: plan, objectives: viewModel.objectives)

                if viewModel.blocks.isEmpty {
                    Text("No training blocks yet — add one to lay out your periodization.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(viewModel.blocks) { block in
                            BlockRow(block: block) {
                                blockSheet = BlockSheet(planId: plan.id, block: block)
                            }
                        }
                    }
                }

                let others = viewModel.plans.filter { $0.id != plan.id }
                if !others.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Text("Other plans:").font(.caption).foregroundStyle(.secondary)
                            ForEach(others) { other in
                                Button(other.name) {
                                    Task { await viewModel.setActivePlan(id: other.id) }
                                }
                                .font(.caption)
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            VStack(spacing: 12) {
                Text("No active macro plan yet.").foregroundStyle(.secondary)
                Button {
                    planSheet = PlanSheet(plan: nil)
                } label: {
                    Label("Create your first plan", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(.dashyOrange)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Objectives section

    @ViewBuilder
    private var objectivesSection: some View {
        let today = WeekDate.formatYMD(Date())
        let upcoming = viewModel.objectives.filter { ($0.endDate ?? $0.startDate) >= today }
        let past = viewModel.objectives.filter { ($0.endDate ?? $0.startDate) < today }

        VStack(alignment: .leading, spacing: 12) {
            Text("Objectives").font(.title3.bold())

            if viewModel.objectives.isEmpty {
                Text("No objectives yet. Add your races, tests, and milestones so your AI agent can plan toward them.")
                    .font(.callout).foregroundStyle(.secondary)
            } else {
                if !upcoming.isEmpty {
                    objectiveGroup("Upcoming", upcoming, muted: false)
                }
                if !past.isEmpty {
                    objectiveGroup("Past", past, muted: true)
                }
            }
        }
    }

    @ViewBuilder
    private func objectiveGroup(_ title: String, _ items: [Objective], muted: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption2.bold()).foregroundStyle(.secondary)
            ForEach(items) { objective in
                ObjectiveRow(
                    objective: objective,
                    onEdit: { objectiveSheet = ObjectiveSheet(objective: objective) },
                    onDelete: { Task { await viewModel.deleteObjective(id: objective.id) } }
                )
                .opacity(muted ? 0.7 : 1)
            }
        }
    }

    // MARK: - Sheet identifiers

    struct ObjectiveSheet: Identifiable {
        let id = UUID()
        let objective: Objective?
    }
    struct PlanSheet: Identifiable {
        let id = UUID()
        let plan: MacroPlan?
    }
    struct BlockSheet: Identifiable {
        let id = UUID()
        let planId: Int
        let block: TrainingBlock?
    }
}

// MARK: - Rows

private struct BlockRow: View {
    let block: TrainingBlock
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(BlockStyle.color(block.blockType, override: block.color))
                    .frame(width: 5, height: 38)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(block.name).font(.subheadline.bold())
                        Text(block.blockType)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(CalendarDate.range(block.startDate, block.endDate))
                        .font(.caption).foregroundStyle(.secondary)
                    if let focus = block.focus, !focus.isEmpty {
                        Text(focus).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct ObjectiveRow: View {
    let objective: Objective
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(objective.objectiveType)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(ObjectiveStyle.typeColor(objective.objectiveType).opacity(0.18))
                        .foregroundStyle(ObjectiveStyle.typeColor(objective.objectiveType))
                        .clipShape(Capsule())
                    if let priority = objective.priority {
                        Text(priority)
                            .font(.caption2.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(ObjectiveStyle.priorityColor(priority))
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                    Text(objective.title).font(.subheadline.bold())
                }
                Text(CalendarDate.range(objective.startDate, objective.endDate)
                     + (objective.notes.map { " · \($0)" } ?? ""))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Menu {
                Button { onEdit() } label: { Label("Edit", systemImage: "pencil") }
                Button(role: .destructive) { onDelete() } label: { Label("Delete", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis").foregroundStyle(.secondary).padding(.leading, 4)
            }
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Timeline bar

/// A compact proportional bar: colored segments per block over the plan span,
/// with pins for in-range objectives and a marker for today.
private struct TimelineBar: View {
    let plan: MacroPlan
    let objectives: [Objective]

    var body: some View {
        let total = max(1, CalendarDate.dayDiff(plan.startDate, plan.endDate) + 1)
        let today = WeekDate.formatYMD(Date())
        let blocks = (plan.blocks ?? []).sorted {
            ($0.blockOrder, $0.startDate) < ($1.blockOrder, $1.startDate)
        }
        let inRange = objectives.filter {
            $0.startDate <= plan.endDate && ($0.endDate ?? $0.startDate) >= plan.startDate
        }

        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.tertiarySystemFill))
                    .frame(height: 20)
                    .offset(y: 12)

                // Block segments
                ForEach(blocks) { block in
                    let start = max(block.startDate, plan.startDate)
                    let end = min(block.endDate, plan.endDate)
                    let left = CGFloat(CalendarDate.dayDiff(plan.startDate, start)) / CGFloat(total) * w
                    let width = CGFloat(CalendarDate.dayDiff(start, end) + 1) / CGFloat(total) * w
                    RoundedRectangle(cornerRadius: 4)
                        .fill(BlockStyle.color(block.blockType, override: block.color))
                        .frame(width: max(2, width), height: 20)
                        .offset(x: max(0, left), y: 12)
                }

                // Objective pins
                ForEach(inRange) { objective in
                    let clamped = max(objective.startDate, plan.startDate)
                    let left = CGFloat(CalendarDate.dayDiff(plan.startDate, clamped)) / CGFloat(total) * w
                    Circle()
                        .fill(objective.priority.map { ObjectiveStyle.priorityColor($0) } ?? Color.gray)
                        .frame(width: 8, height: 8)
                        .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 1.5))
                        .offset(x: min(max(0, left - 4), w - 8), y: 4)
                }

                // Today marker
                if today >= plan.startDate && today <= plan.endDate {
                    let left = CGFloat(CalendarDate.dayDiff(plan.startDate, today)) / CGFloat(total) * w
                    Rectangle()
                        .fill(Color.red.opacity(0.7))
                        .frame(width: 1.5, height: 28)
                        .offset(x: min(max(0, left), w - 1.5), y: 8)
                }
            }
        }
        .frame(height: 40)
    }
}

// MARK: - Styling + date helpers

enum BlockStyle {
    static func color(_ type: String, override: String?) -> Color {
        if let override, !override.isEmpty, override.hasPrefix("#") {
            return Color(hex: override)
        }
        switch type {
        case "base": return .blue
        case "build": return .orange
        case "peak": return .red
        case "taper": return .purple
        case "recovery": return .green
        case "race": return .yellow
        default: return .gray
        }
    }
}

enum ObjectiveStyle {
    static func typeColor(_ type: String) -> Color {
        switch type {
        case "race": return .red
        case "test": return .blue
        case "milestone": return .green
        case "camp": return .purple
        default: return .gray
        }
    }
    static func priorityColor(_ priority: String) -> Color {
        switch priority {
        case "A": return .red
        case "B": return .orange
        case "C": return .blue
        default: return .gray
        }
    }
}

/// Date helpers for the calendar UI (YYYY-MM-DD strings), building on `WeekDate`.
enum CalendarDate {
    private static let human: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM d, yyyy"
        return f
    }()

    static func human(_ ymd: String) -> String {
        guard let date = WeekDate.parseYMD(ymd) else { return ymd }
        return human.string(from: date)
    }

    static func range(_ start: String, _ end: String?) -> String {
        guard let end, end != start else { return human(start) }
        return "\(human(start)) – \(human(end))"
    }

    static func dayDiff(_ a: String, _ b: String) -> Int {
        guard let da = WeekDate.parseYMD(a), let db = WeekDate.parseYMD(b) else { return 0 }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: da, to: db).day ?? 0
    }
}
