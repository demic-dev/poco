import AppIntents
import SwiftUI
import WidgetKit

@main
struct PocoWidgets: WidgetBundle {
    var body: some Widget {
        NextWidget()
        CaptureWidget()
        CaptureControl()
    }
}

// Next: the first unchecked line of today's pick. Lock Screen and Home Screen.

struct NextEntry: TimelineEntry {
    let date: Date
    let text: String
    let progress: String? // "1 of 3"
}

struct NextProvider: TimelineProvider {
    func entry(at date: Date) -> NextEntry {
        var progress: String?
        if let t = readToday(), t.date == isoDay(date), t.next != nil {
            progress = "\(t.done + 1) of \(t.total)"
        }
        return NextEntry(date: date, text: nextText(on: date), progress: progress)
    }

    func placeholder(in context: Context) -> NextEntry {
        NextEntry(date: .now, text: "Email Jonas about the flat inspection", progress: "1 of 3")
    }

    func getSnapshot(in context: Context, completion: @escaping (NextEntry) -> Void) {
        completion(entry(at: .now))
    }

    // The app reloads the widget when today.md changes; the second entry turns
    // yesterday's pick into "Nothing picked yet" at midnight.
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextEntry>) -> Void) {
        let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: .now))!
        completion(Timeline(entries: [entry(at: .now), entry(at: midnight)], policy: .never))
    }
}

struct NextView: View {
    @Environment(\.widgetFamily) var family
    let entry: NextEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Text(entry.text)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("NEXT").font(.caption2.weight(.bold)).widgetAccentable()
                Text(entry.text).font(.headline).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("NEXT").font(.caption.weight(.semibold)).foregroundStyle(Color("pine"))
                    Spacer()
                    if let progress = entry.progress {
                        Text(progress).font(.caption).foregroundStyle(Color("muted"))
                    }
                }
                Spacer(minLength: 0)
                Text(entry.text).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color("ink")).lineLimit(4)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

struct NextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "next", provider: NextProvider()) { entry in
            NextView(entry: entry)
                .containerBackground(for: .widget) { Color("paper") }
                .widgetURL(URL(string: "poco://today"))
        }
        .configurationDisplayName("Next")
        .description("The next thing from today's pick.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall])
    }
}

// Capture: a round Lock Screen button that opens the app's capture sheet.

struct CaptureEntry: TimelineEntry {
    let date: Date
}

struct CaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaptureEntry { CaptureEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) { completion(CaptureEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
        completion(Timeline(entries: [CaptureEntry(date: .now)], policy: .never))
    }
}

struct CaptureWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "capture", provider: CaptureProvider()) { _ in
            Image(systemName: "plus")
                .font(.title2.weight(.semibold))
                .accessibilityLabel("Capture")
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
                .widgetURL(URL(string: "poco://capture"))
        }
        .configurationDisplayName("Capture")
        .description("Opens poco ready to capture.")
        .supportedFamilies([.accessoryCircular])
    }
}

// Control Center, Lock Screen corner and Action Button: asks for the text
// right where you are, then saves it to the outbox.

struct CaptureControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "dev.demic.poco.capture") {
            ControlWidgetButton(action: CaptureIntent()) {
                Label("Capture", systemImage: "square.and.pencil")
            }
        }
        .displayName("Capture")
        .description("Add a thought to the poco inbox.")
    }
}
