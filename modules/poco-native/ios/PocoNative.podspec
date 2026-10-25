Pod::Spec.new do |s|
  s.name           = 'PocoNative'
  s.version        = '1.0.0'
  s.summary        = 'App Group and background time for poco'
  s.author         = ''
  s.homepage       = 'https://demic.dev'
  s.platforms      = { :ios => '18.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
  s.source_files = '**/*.swift'
end
