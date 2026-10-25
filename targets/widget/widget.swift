import SwiftUI
import WidgetKit

// SideStore re-signs with the free Apple ID and renames App Groups to
// `group.dev.demic.poco.<TEAMID>`, so read the real one from our profile.
let appGroup: String = {
    let base = "group.dev.demic.poco"
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let raw = try? String(contentsOf: url, encoding: .isoLatin1),
          let match = raw.firstMatch(of: /<string>(group\.dev\.demic\.poco[^<]*)<\/string>/)
    else { return base }
    return String(match.1)
}()

struct Entry: TimelineEntry {
    let date: Date
    let value: String
}

struct Provider: TimelineProvider {
    func read() -> Entry {
        Entry(date: .now, value: UserDefaults(suiteName: appGroup)?.string(forKey: "value") ?? "nothing yet")
    }

    func placeholder(in context: Context) -> Entry { Entry(date: .now, value: "…") }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .never))
    }
}

@main
struct PocoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "widget", provider: Provider()) { entry in
            VStack(alignment: .leading) {
                Text(entry.value).font(.headline)
                Text(appGroup).font(.caption2).foregroundStyle(.secondary)
            }
            .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("poco spike")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}
