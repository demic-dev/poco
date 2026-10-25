import ExpoModulesCore
import UIKit

// SideStore re-signs with the free Apple ID and renames App Groups to
// `group.dev.demic.poco.<TEAMID>`, so read the real one from our profile.
// The same lookup is in targets/widget/_shared/Poco.swift and targets/share/Share.swift.
private let appGroup: String = {
  let base = "group.dev.demic.poco"
  guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
        let raw = try? String(contentsOf: url, encoding: .isoLatin1),
        let r = raw.range(of: "<string>group\\.dev\\.demic\\.poco[^<]*</string>", options: .regularExpression)
  else { return base }
  return String(raw[r].dropFirst("<string>".count).dropLast("</string>".count))
}()

private final class BackgroundTask {
  var id = UIBackgroundTaskIdentifier.invalid
  func end() { UIApplication.shared.endBackgroundTask(id) }
}

public class PocoNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PocoNative")

    Constant("appGroup") { appGroup }

    // The shared folder where the widget, the intents and the share extension leave events.
    Constant("containerPath") {
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.path
    }

    // Keeps the app running for a few seconds after it goes to the background,
    // so the outbox can finish uploading. Returns the id for endBackgroundTask.
    Function("beginBackgroundTask") { () -> Int in
      let task = BackgroundTask()
      task.id = UIApplication.shared.beginBackgroundTask(withName: "outbox") { task.end() }
      return task.id.rawValue
    }

    Function("endBackgroundTask") { (id: Int) in
      UIApplication.shared.endBackgroundTask(UIBackgroundTaskIdentifier(rawValue: id))
    }
  }
}
