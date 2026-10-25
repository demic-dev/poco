import AppIntents

// What Shortcuts, Siri, Spotlight and the Action Button offer without any setup.
struct PocoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureIntent(),
            phrases: ["Capture in \(.applicationName)", "Add to \(.applicationName) inbox"],
            shortTitle: "Capture",
            systemImageName: "square.and.pencil"
        )
        AppShortcut(
            intent: NextIntent(),
            phrases: ["What's next in \(.applicationName)"],
            shortTitle: "What's next",
            systemImageName: "arrow.forward.circle"
        )
    }
}
