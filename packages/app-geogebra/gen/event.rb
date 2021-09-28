SOURCE = 'https://wiki.geogebra.org/en/Reference:GeoGebra_Apps_API#Client_Events'
require 'open-uri'
html = URI.open(SOURCE, &:read)
start = html.index 'id="Client_Events"'
i = html.index '<tbody>', start
j = html.index '</tbody>', i
table = html[i...j].split '<tr>'
heads = []
sections = []
table.each { |part|
  if part.include? '<th>'
    heads = part.scan(/th>(.+?)<\/th/m).flatten.map &:strip
  elsif part.include? '<td>'
    sections.push part.scan(/td>(.+?)<\/td/m).flatten.map &:strip
  end
}
sections.each { |(type, attrs, desc)|
  attrs = attrs.gsub /<\/?code>/, '`'

  puts "// #{desc}, #{attrs}"
  a = attrs.scan /`(\w+)`:[^`]+/
  a = a.flatten.map { |e| ", #{e}: string" }.join
  puts "| { type: #{type.inspect}#{a} }"
}
