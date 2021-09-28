SOURCE = 'https://github.com/geogebra/geogebra/blob/master/web/src/main/java/org/geogebra/web/html5/util/AppletParameters.java'
cdn = SOURCE.sub /^https:\/\/github\.com\/(\w+)\/(\w+)\/blob\/(\w+)/, 'https://cdn.jsdelivr.net/gh/\1/\2@\3'
require 'open-uri'
code = URI.open(cdn, &:read)

meth = code.scan /private (\w+) (get\w+DataParam)/
params = code.scan /public (\w+) (get(?:Data)?Param\w+)/

meth_re = Regexp.new "(?:#{meth.map { |e| e[1] }.join ?|})"

find_next_paren = -> code, i, l, r {
  raise ArgumentError, 'code[i] must be left paren' if code[i] != l
  j, k = i + 1, 0
  while k >= 0
    case code[j]
    when l then k += 1
    when r then k -= 1
    end
    j += 1
  end
  return j - 1
}

params.each do |(type, name)|
  i = code.index ?{, code.index("#{type} #{name}")
  j = find_next_paren.(code, i, ?{, ?})
  define = code[i..j]
  m = define.match meth_re
  if m.nil?
    k = define.match('getAttribute').end(0)
    l = find_next_paren.(define, k, ?(, ?))
    param, = define[k..l][1...-1].split /,\s*/
    param = param.undump
    if param == 'id'
      default = 'ggbApplet'
    end
  else
    k = m.end(0)
    l = find_next_paren.(define, k, ?(, ?))
    param, default = define[k..l][1...-1].split /,\s*/
    param = param.undump
    if default[0] == '"'
      default = default.undump
    elsif default == 'true'
      default = true
    elsif default == 'false'
      default = false
    else
      default =
        case type
        when 'int' then default.to_i
        when 'double' then default.to_f
        when 'String' then default.undump rescue ""
        when 'boolean' then false
        end
    end
  end

  ts_type =
    case type
    when 'String' then 'string'
    when 'int', 'double' then 'number'
    when 'boolean' then 'boolean'
    else type
    end

  puts "/** @default #{default.inspect} */\n#{param}: #{ts_type};"
end
