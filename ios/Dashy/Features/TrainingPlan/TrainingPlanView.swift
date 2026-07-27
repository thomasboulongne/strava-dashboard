import SwiftUI

struct TrainingPlanView: View {
    @EnvironmentObject private var refresh: RefreshCenter
    @StateObject private var viewModel = TrainingPlanViewModel()
    @State private var editTarget: EditTarget?
    @State private var showingClearConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    weekHeader

                    if viewModel.isLoading && viewModel.response == nil {
                        ProgressView().padding(.top, 40)
                    } else if let error = viewModel.errorMessage, viewModel.response == nil {
                        ContentUnavailableView {
                            Label("Couldn't load plan", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") { Task { await viewModel.refresh(refresh, showBanner: true) } }
                        }
                        .padding(.top, 40)
                    } else {
                        ForEach(WeekDate.weekDates(viewModel.weekStart), id: \.self) { date in
                            DaySectionView(
                                date: date,
                                workouts: viewModel.workouts(on: date),
                                unmatched: viewModel.unmatchedActivities(on: date),
                                onLink: { workoutId, activityId in
                                    Task { await viewModel.link(workoutId: workoutId, activityId: activityId) }
                                },
                                onUnlink: { workoutId in
                                    Task { await viewModel.unlink(workoutId: workoutId) }
                                },
                                onEdit: { workout in
                                    editTarget = EditTarget(date: workout.workoutDate, workout: workout)
                                },
                                onDelete: { workoutId in
                                    Task { await viewModel.deleteWorkout(id: workoutId) }
                                },
                                onAdd: { dateKey in
                                    editTarget = EditTarget(date: dateKey, workout: nil)
                                }
                            )
                        }

                        WeeklySummaryView(
                            workouts: viewModel.workouts,
                            unmatched: viewModel.unmatchedActivities
                        )
                    }
                }
                .padding()
            }
            .navigationTitle("Training Plan")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Today") { viewModel.goToToday() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if !viewModel.workouts.isEmpty {
                        Button(role: .destructive) {
                            showingClearConfirm = true
                        } label: {
                            Image(systemName: "trash")
                        }
                    }
                }
            }
            .refreshable { await viewModel.refresh(refresh, showBanner: false) }
            .task { await viewModel.start(refresh) }
            .onChange(of: refresh.refreshToken) {
                Task { await viewModel.refresh(refresh, showBanner: true) }
            }
            .sheet(item: $editTarget) { target in
                WorkoutEditView(
                    title: target.workout == nil ? "Add Workout" : "Edit Workout",
                    existing: target.workout
                ) { name, duration, intensity, notes, timeOfDay in
                    Task {
                        if let workout = target.workout {
                            await viewModel.updateWorkout(
                                id: workout.id,
                                sessionName: name,
                                durationMinutes: duration,
                                intensity: intensity,
                                notes: notes,
                                timeOfDay: timeOfDay
                            )
                        } else {
                            await viewModel.createWorkout(
                                date: target.date,
                                sessionName: name,
                                durationMinutes: duration,
                                intensity: intensity,
                                notes: notes,
                                timeOfDay: timeOfDay
                            )
                        }
                    }
                }
            }
            .confirmationDialog(
                "Clear all workouts this week?",
                isPresented: $showingClearConfirm,
                titleVisibility: .visible
            ) {
                Button("Clear Week", role: .destructive) {
                    Task { await viewModel.clearWeek() }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private var weekHeader: some View {
        HStack {
            Button { viewModel.goToPreviousWeek() } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(WeekDate.formatWeekRange(viewModel.weekStart))
                .font(.headline)
            Spacer()
            Button { viewModel.goToNextWeek() } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding(.horizontal, 4)
    }

    struct EditTarget: Identifiable {
        let id = UUID()
        let date: String
        let workout: TrainingWorkout?
    }
}

/// One day's column: header, workout cards, stray activities, and an add button.
private struct DaySectionView: View {
    let date: Date
    let workouts: [TrainingWorkout]
    let unmatched: [UnmatchedActivity]
    let onLink: (Int, Int) -> Void
    let onUnlink: (Int) -> Void
    let onEdit: (TrainingWorkout) -> Void
    let onDelete: (Int) -> Void
    let onAdd: (String) -> Void

    private var isToday: Bool { Calendar.current.isDateInToday(date) }
    private var isPast: Bool { date < Calendar.current.startOfDay(for: Date()) }
    private var dateKey: String { WeekDate.formatYMD(date) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(dayName)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(isToday ? Color.dashyOrange : .primary)
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            ForEach(workouts) { workout in
                WorkoutCardView(
                    workout: workout,
                    linkableActivities: unmatched,
                    onLink: { onLink(workout.id, $0) },
                    onUnlink: { onUnlink(workout.id) },
                    onEdit: { onEdit(workout) },
                    onDelete: { onDelete(workout.id) }
                )
            }

            // Day with no planned workouts but stray activities: show read-only.
            if workouts.isEmpty {
                ForEach(unmatched) { item in
                    HStack {
                        Image(systemName: ActivitySport.symbol(for: item.data))
                            .font(.caption).foregroundStyle(.secondary)
                        Text(item.data.name).font(.caption).lineLimit(1)
                        Spacer()
                        Text(Formatters.clock(seconds: item.data.movingTime))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.tertiarySystemFill))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            Button {
                onAdd(dateKey)
            } label: {
                Label("Add workout", systemImage: "plus")
                    .font(.caption)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4]))
                            .foregroundStyle(.secondary)
                    )
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isToday ? Color.dashyOrange.opacity(0.08) : Color(.systemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .opacity(isPast && workouts.isEmpty && unmatched.isEmpty ? 0.6 : 1)
    }

    private var dayName: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE"
        return f.string(from: date)
    }
}
