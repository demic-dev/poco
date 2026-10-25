import SwiftUI
import UIKit
import UniformTypeIdentifiers

// The share sheet: page title and link (or the shared text), an optional note,
// Save. The capture waits in the outbox until the app uploads it.

// Same lookup and outbox as targets/widget/_shared/Poco.swift, which only links
// into the app and the widget.
private let appGroup: String = {
    let base = "group.dev.demic.poco"
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let raw = try? String(contentsOf: url, encoding: .isoLatin1),
          let r = raw.range(of: "<string>group\\.dev\\.demic\\.poco[^<]*</string>", options: .regularExpression)
    else { return base }
    return String(raw[r].dropFirst("<string>".count).dropLast("</string>".count))
}()

private func queueEvent(_ fields: [String: String]) throws {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
        throw CocoaError(.fileNoSuchFile)
    }
    let dir = container.appendingPathComponent("outbox", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let time = ISO8601DateFormatter().string(from: .now)
    let id = time.replacingOccurrences(of: ":", with: "-") + "-" + UUID().uuidString.prefix(8).lowercased()
    var event = fields
    event["id"] = id
    event["time"] = time
    let data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
    try data.write(to: dir.appendingPathComponent(id + ".json"), options: .atomic)
}

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let item = extensionContext?.inputItems.first as? NSExtensionItem
        let title = (item?.attributedContentText?.string ?? item?.attributedTitle?.string)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let providers = item?.attachments ?? []
        Task { @MainActor in
            var url: URL?
            var text: String?
            for p in providers {
                if url == nil, p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
                } else if text == nil, p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    text = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
                }
            }
            // Some apps share a link as plain text.
            if url == nil, let t = text?.trimmingCharacters(in: .whitespacesAndNewlines),
               let u = URL(string: t), u.scheme?.hasPrefix("http") == true {
                url = u
                text = nil
            }
            show(ShareView(
                title: url == nil ? nil : (title?.isEmpty == false ? title : nil),
                url: url,
                quote: url == nil ? (text ?? title) : nil,
                cancel: { [weak self] in
                    self?.extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
                },
                save: { [weak self] event in
                    try queueEvent(event)
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    self?.extensionContext?.completeRequest(returningItems: nil)
                }
            ))
        }
    }

    private func show(_ root: ShareView) {
        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}

struct ShareView: View {
    let title: String?
    let url: URL?
    let quote: String?
    let cancel: () -> Void
    let save: ([String: String]) throws -> Void

    @State private var note = ""
    @State private var error: String?

    private var linkLabel: String {
        guard let url else { return "" }
        return (url.host ?? "") + (url.path == "/" ? "" : url.path)
    }

    private func submit() {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        var event = ["type": "capture", "text": title ?? quote ?? url?.absoluteString ?? ""]
        event["url"] = url?.absoluteString
        event["note"] = trimmed.isEmpty ? nil : trimmed
        do {
            try save(event)
        } catch {
            self.error = "Couldn't save: \(error.localizedDescription)"
        }
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    if url != nil {
                        Image(systemName: "link")
                            .font(.title3)
                            .foregroundStyle(Color("muted"))
                            .frame(width: 56, height: 56)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Color("paper")))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        if let quote {
                            Text("“\(quote)”").font(.title3.weight(.medium)).lineLimit(6)
                        } else {
                            Text(title ?? linkLabel).font(.headline).lineLimit(3)
                            Text(linkLabel).font(.footnote).foregroundStyle(Color("muted")).lineLimit(1)
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 20).fill(Color("card")))

                VStack(alignment: .leading, spacing: 6) {
                    Text("NOTE — OPTIONAL").font(.footnote.weight(.semibold)).foregroundStyle(Color("muted"))
                    TextField("Why did you save this?", text: $note)
                        .submitLabel(.done)
                        .onSubmit(submit)
                        .padding(.horizontal, 16)
                        .frame(height: 52)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Color("card")))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color("line")))
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Color("muted"))
                }

                Spacer(minLength: 0)

                Button(action: submit) {
                    Text("Save to inbox")
                        .font(.headline)
                        .foregroundStyle(Color("onPine"))
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(Capsule().fill(Color("pine")))
                }
            }
            .padding(20)
            .background(Color("paper"))
            .navigationTitle("Add to inbox")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: cancel).foregroundStyle(Color("muted"))
                }
            }
        }
    }
}
