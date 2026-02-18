// MiniJSON - Simple JSON library for Unity
// Based on the MiniJSON library (public domain)

using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;

namespace AfricaPaymentsMcp
{
    /// <summary>
    /// Simple JSON parser/serializer for Unity
    /// </summary>
    public static class MiniJSON
    {
        /// <summary>
        /// Parse a JSON string into a dictionary
        /// </summary>
        public static object Deserialize(string json)
        {
            if (string.IsNullOrEmpty(json))
                return null;

            return Parser.Parse(json);
        }

        /// <summary>
        /// Serialize an object to JSON string
        /// </summary>
        public static string Serialize(object obj)
        {
            return Serializer.Serialize(obj);
        }

        private sealed class Parser : IDisposable
        {
            private readonly string json;
            private int index;

            private Parser(string jsonString)
            {
                json = jsonString;
                index = 0;
            }

            public static object Parse(string jsonString)
            {
                using var parser = new Parser(jsonString);
                return parser.ParseValue();
            }

            private Dictionary<string, object> ParseObject()
            {
                var table = new Dictionary<string, object>();
                index++; // Skip '{'
                SkipWhitespace();

                while (true)
                {
                    if (index >= json.Length)
                        break;

                    if (json[index] == '}')
                    {
                        index++;
                        break;
                    }

                    var key = ParseString();
                    SkipWhitespace();
                    
                    if (json[index] == ':')
                        index++;
                    
                    SkipWhitespace();
                    
                    var value = ParseValue();
                    table[key] = value;
                    
                    SkipWhitespace();
                    
                    if (json[index] == ',')
                    {
                        index++;
                        SkipWhitespace();
                    }
                }

                return table;
            }

            private List<object> ParseArray()
            {
                var array = new List<object>();
                index++; // Skip '['
                SkipWhitespace();

                while (true)
                {
                    if (index >= json.Length)
                        break;

                    if (json[index] == ']')
                    {
                        index++;
                        break;
                    }

                    var value = ParseValue();
                    array.Add(value);
                    
                    SkipWhitespace();
                    
                    if (json[index] == ',')
                    {
                        index++;
                        SkipWhitespace();
                    }
                }

                return array;
            }

            private object ParseValue()
            {
                SkipWhitespace();

                if (index >= json.Length)
                    return null;

                char c = json[index];

                switch (c)
                {
                    case '{':
                        return ParseObject();
                    case '[':
                        return ParseArray();
                    case '"':
                        return ParseString();
                    case 't':
                        index += 4;
                        return true;
                    case 'f':
                        index += 5;
                        return false;
                    case 'n':
                        index += 4;
                        return null;
                    default:
                        if (char.IsDigit(c) || c == '-')
                            return ParseNumber();
                        return null;
                }
            }

            private string ParseString()
            {
                var sb = new StringBuilder();
                index++; // Skip opening quote

                while (index < json.Length)
                {
                    char c = json[index];
                    
                    if (c == '"')
                    {
                        index++;
                        break;
                    }

                    if (c == '\\' && index + 1 < json.Length)
                    {
                        index++;
                        c = json[index];
                        switch (c)
                        {
                            case '"': sb.Append('"'); break;
                            case '\\': sb.Append('\\'); break;
                            case '/': sb.Append('/'); break;
                            case 'b': sb.Append('\b'); break;
                            case 'f': sb.Append('\f'); break;
                            case 'n': sb.Append('\n'); break;
                            case 'r': sb.Append('\r'); break;
                            case 't': sb.Append('\t'); break;
                            default: sb.Append(c); break;
                        }
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    index++;
                }

                return sb.ToString();
            }

            private object ParseNumber()
            {
                int start = index;
                
                if (json[index] == '-')
                    index++;

                while (index < json.Length && char.IsDigit(json[index]))
                    index++;

                if (index < json.Length && json[index] == '.')
                {
                    index++;
                    while (index < json.Length && char.IsDigit(json[index]))
                        index++;
                }

                string numberStr = json.Substring(start, index - start);
                
                if (numberStr.Contains("."))
                {
                    if (double.TryParse(numberStr, out double d))
                        return d;
                }
                else
                {
                    if (long.TryParse(numberStr, out long l))
                        return l;
                }

                return numberStr;
            }

            private void SkipWhitespace()
            {
                while (index < json.Length && char.IsWhiteSpace(json[index]))
                    index++;
            }

            public void Dispose()
            {
                // Nothing to dispose
            }
        }

        private sealed class Serializer
        {
            private readonly StringBuilder builder;

            private Serializer()
            {
                builder = new StringBuilder();
            }

            public static string Serialize(object obj)
            {
                var serializer = new Serializer();
                serializer.SerializeValue(obj);
                return serializer.builder.ToString();
            }

            private void SerializeValue(object value)
            {
                if (value == null)
                {
                    builder.Append("null");
                }
                else if (value is string str)
                {
                    SerializeString(str);
                }
                else if (value is bool b)
                {
                    builder.Append(b ? "true" : "false");
                }
                else if (value is double d)
                {
                    builder.Append(d.ToString(System.Globalization.CultureInfo.InvariantCulture));
                }
                else if (value is float f)
                {
                    builder.Append(f.ToString(System.Globalization.CultureInfo.InvariantCulture));
                }
                else if (value is int i)
                {
                    builder.Append(i);
                }
                else if (value is long l)
                {
                    builder.Append(l);
                }
                else if (value is IDictionary dict)
                {
                    SerializeObject(dict);
                }
                else if (value is IEnumerable list)
                {
                    SerializeArray(list);
                }
                else
                {
                    SerializeString(value.ToString());
                }
            }

            private void SerializeObject(IDictionary obj)
            {
                builder.Append('{');
                bool first = true;

                foreach (DictionaryEntry entry in obj)
                {
                    if (!first)
                        builder.Append(',');
                    
                    SerializeString(entry.Key.ToString());
                    builder.Append(':');
                    SerializeValue(entry.Value);
                    
                    first = false;
                }

                builder.Append('}');
            }

            private void SerializeArray(IEnumerable array)
            {
                builder.Append('[');
                bool first = true;

                foreach (var item in array)
                {
                    if (!first)
                        builder.Append(',');
                    
                    SerializeValue(item);
                    first = false;
                }

                builder.Append(']');
            }

            private void SerializeString(string str)
            {
                builder.Append('"');
                
                foreach (char c in str)
                {
                    switch (c)
                    {
                        case '"': builder.Append("\\\""); break;
                        case '\\': builder.Append("\\\\"); break;
                        case '\b': builder.Append("\\b"); break;
                        case '\f': builder.Append("\\f"); break;
                        case '\n': builder.Append("\\n"); break;
                        case '\r': builder.Append("\\r"); break;
                        case '\t': builder.Append("\\t"); break;
                        default: builder.Append(c); break;
                    }
                }

                builder.Append('"');
            }
        }
    }
}
