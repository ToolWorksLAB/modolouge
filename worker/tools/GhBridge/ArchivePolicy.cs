using System.Globalization;
using System.Xml.Linq;

// Validate inert archive metadata before Grasshopper is allowed to deserialize it.
public static class ArchivePolicy
{
    public const string GraphMapper = "bc984576-7aa6-491f-a91d-e444c33675a7";
    public const string Bezier = "7026a6d2-9b94-4314-b6d3-6850eff942fe";
    public static void Validate(XDocument xml, XElement[] objects, HashSet<string> policy)
    {
        var unsupported = objects.Where(o => !policy.Contains(Value(o, "GUID")))
            .Select(o => $"{Value(o, "Name")} ({Value(o, "GUID")})").Distinct().ToArray();
        if (unsupported.Length > 0)
            throw new Exception($"Not yet supported by Modolouge: {string.Join("; ", unsupported.Take(6))}"
                + (unsupported.Length > 6 ? $"; and {unsupported.Length - 6} more types" : "")
                + ". This can include standard Grasshopper components that have not been enabled yet; it does not necessarily mean your file uses plugins.");
        if (xml.Descendants("chunk").Count(x => (string?)x.Attribute("name") == "DefinitionObjects") != 1)
            throw new Exception("Nested definitions and clusters are not supported.");
        foreach (var item in xml.Descendants())
        {
            var n = ((string?)item.Attribute("name") ?? "").ToLowerInvariant();
            if (n == "internalexpression" && item.Name == "item")
            {
                if (!ArithmeticExpression.IsAllowed(item.Value))
                    throw new Exception("This input expression is not supported. Use arithmetic with x, numbers, parentheses and + - * / % ^. Functions and scripts are not enabled.");
                continue;
            }
            if ((n.Contains("script") && n != "description") || n.Contains("assembly") || n.Contains("cluster") || n.Contains("expression"))
                throw new Exception("Embedded scripts, assemblies, clusters and unrestricted expressions are not supported by the public service.");
            if ((n == "stream" && !item.Value.Equals("false", StringComparison.OrdinalIgnoreCase)) ||
                (n == "streampath" && !string.IsNullOrWhiteSpace(item.Value)))
                throw new Exception("Panel file streaming is not supported. Disable Stream Contents and clear Stream Destination before uploading.");
        }
        foreach (var obj in objects)
        {
            var id = Value(obj, "GUID").ToLowerInvariant();
            var c = Chunk(obj, "Container");
            if (c == null) continue;
            // Generic parameters/relays may forward reviewed data, but must not
            // deserialize arbitrary persisted .NET/plugin objects.
            if (id is "8ec86459-bf01-4409-baee-174d0d2b13d0" or "b6236720-8d88-4289-93c3-ac4c99f9b97b")
                if (c.Descendants("chunk").Any(x => (string?)x.Attribute("name") == "PersistentData" && x.Element("chunks")?.Elements().Any() == true))
                    throw new Exception("Internalized generic Data/Relay objects are not supported. Supply their data through connected components.");
            if (id != GraphMapper) continue;
            var local = Chunk(c, "LocalGraph");
            var graph = local == null ? null : Chunk(local, "Graph");
            if (graph != null && !Value(graph, "container_id").Equals(Bezier, StringComparison.OrdinalIgnoreCase))
                throw new Exception("This Graph Mapper curve is not enabled yet. The saved Bezier mapping is currently supported.");
            if (local != null)
                foreach (var value in local.Descendants("item").Where(x => (string?)x.Attribute("type_code") == "6"))
                    if (!double.TryParse(value.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) || !double.IsFinite(number))
                        throw new Exception("Graph Mapper contains a non-finite coordinate.");
        }
    }
    static XElement? Chunk(XElement e, string name) => e.Element("chunks")?.Elements("chunk").FirstOrDefault(x => (string?)x.Attribute("name") == name);
    static string Value(XElement e, string name) => e.Element("items")?.Elements("item").FirstOrDefault(x => (string?)x.Attribute("name") == name)?.Value ?? "";
}

// A closed arithmetic grammar, not a blacklist or an expression evaluator.
public sealed class ArithmeticExpression
{
    readonly string text;
    int at;
    ArithmeticExpression(string value) { text = value; }
    public static bool IsAllowed(string value)
    {
        if (value.Length > 256) return false;
        if (string.IsNullOrWhiteSpace(value)) return true;
        var parser = new ArithmeticExpression(value);
        return parser.Expression(0) && parser.End();
    }
    void Space() { while (at < text.Length && char.IsWhiteSpace(text[at])) at++; }
    bool End() { Space(); return at == text.Length; }
    bool Expression(int depth)
    {
        if (depth > 32 || !Atom(depth + 1)) return false;
        Space();
        while (at < text.Length && "+-*/%^".Contains(text[at]))
        { at++; if (!Atom(depth + 1)) return false; Space(); }
        return true;
    }
    bool Atom(int depth)
    {
        if (depth > 32) return false;
        Space();
        if (at == text.Length) return false;
        if (text[at] is '+' or '-') { at++; return Atom(depth + 1); }
        if (text[at] == '(')
        {
            at++; if (!Expression(depth + 1)) return false; Space();
            if (at == text.Length || text[at] != ')') return false;
            at++; return true;
        }
        if (text[at] == 'x') { at++; return true; }
        var start = at;
        while (at < text.Length && char.IsAsciiDigit(text[at])) at++;
        if (at < text.Length && text[at] == '.')
        { at++; while (at < text.Length && char.IsAsciiDigit(text[at])) at++; }
        if (at < text.Length && text[at] is 'e' or 'E')
        {
            at++; if (at < text.Length && text[at] is '+' or '-') at++;
            var exponent = at;
            while (at < text.Length && char.IsAsciiDigit(text[at])) at++;
            if (at == exponent) return false;
        }
        return at > start && double.TryParse(text[start..at], NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n);
    }
}
