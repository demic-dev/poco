import AppIntents
import Foundation

// Compiled into both the app and the widget extension (apple-targets links `_shared`),
// so Shortcuts sees the intents and the Control Center control can run them.

// SideStore re-signs with the free Apple ID and renames App Groups to
// `group.dev.demic.poco.<TEAMID>`, so read the real one from our profile.
// The same lookup is in modules/poco-native and targets/share/Share.swift.
let appGroup: String = {
    let base = "group.dev.demic.poco"
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let raw = try? String(contentsOf: url, encoding: .isoLatin1),
          let r = raw.range(of: "<string>group\\.dev\\.demic\\.poco[^<]*</string>", options: .regularExpression)
    else { return base }
    return String(raw[r].dropFirst("<string>".count).dropLast("</string>".count))
}()

// What the app last saw in today.md, written by the app as JSON under "today".
struct TodayState: Codable {
    var date: String // YYYY-MM-DD of the pick
    var next: String? // nil when everything is done
    var done: Int
    var total: Int
}

func readToday() -> TodayState? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "today") else { return nil }
    return try? JSONDecoder().decode(TodayState.self, from: Data(json.utf8))
}

func isoDay(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

func nextText(on date: Date = .now) -> String {
    guard let t = readToday(), t.date == isoDay(date) else { return "Nothing picked yet" }
    return t.next ?? "That's today."
}

struct PocoError: LocalizedError {
    let errorDescription: String?
}

// Events wait in <group>/outbox/ until the app uploads them to `_events/`, same name, same bytes.
func queueEvent(_ fields: [String: String]) throws {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
        throw PocoError(errorDescription: "poco can't reach its shared folder.")
    }
    let dir = container.appendingPathComponent("outbox", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let time = ISO8601DateFormatter().string(from: .now) // 2026-10-25T10:24:03Z
    let id = time.replacingOccurrences(of: ":", with: "-") + "-" + UUID().uuidString.prefix(8).lowercased()
    var event = fields
    event["id"] = id
    event["time"] = time
    let data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
    try data.write(to: dir.appendingPathComponent(id + ".json"), options: .atomic)
}

struct CaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Capture"
    static var description = IntentDescription("Add a thought to the poco inbox.")

    @Parameter(title: "Text", requestValueDialog: "What's on your mind?")
    var text: String

    @Parameter(title: "Link")
    var url: URL?

    @Parameter(title: "Note")
    var note: String?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var event = ["type": "capture", "text": text]
        event["url"] = url?.absoluteString
        event["note"] = note
        try queueEvent(event)
        return .result(dialog: "Saved to inbox")
    }
}

struct NextIntent: AppIntent {
    static var title: LocalizedStringResource = "What's next"
    static var description = IntentDescription("The next thing from today's pick.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let text = nextText()
        return .result(value: text, dialog: IntentDialog(stringLiteral: text))
    }
}
