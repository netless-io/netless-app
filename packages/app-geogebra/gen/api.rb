SOURCE = 'https://github.com/geogebra/geogebra/blob/master/web/src/main/java/org/geogebra/web/html5/main/DefaultExportedApi.java'
cdn = SOURCE.sub /^https:\/\/github\.com\/(\w+)\/(\w+)\/blob\/(\w+)/, 'https://cdn.jsdelivr.net/gh/\1/\2@\3'
require 'open-uri'
code = URI.open(cdn, &:read)

ts = -> s {
  case s
  when 'String' then 'string'
  when 'String[]' then 'string[]'
  when 'Object' then 'any'
  when 'double', 'int' then 'number'
  when 'boolean' then 'boolean'
  when 'void' then 'void'
  when 'Element' then 'HTMLElement'
  when 'JsRunnable' then '() => void'
  when 'StringConsumer' then '(data: string) => void'
  when /Promise<(\S+)>/ then "Promise<#{ts.($1)}>"
  when /JsArray<(\S+)>/ then "Array<#{ts.($1)}>"
  when /JsPropertyMap<(\S+)>/ then "Record<string, #{ts.($1)}>"
  else
    raise ArgumentError, "unknown type #{s.inspect}"
  end
}

meth = code.scan /public (\S+) (\w+)\((.*)\)/
meth.each { |(ret, name, params)|
  next if %w( setGgbAPI setScriptManager ).include? name
  params = params.split /,\s*/
  params = params.map { |x|
    t, a = x.split
    t = ts.(t)
    "#{a}: #{t}"
  }
  t = ts.(ret)
  puts "#{name}(#{params.join ', '}): #{t};"
}
