using System.Globalization;
using System.Xml.Linq;

// Presentation metadata only: never instantiate a Grasshopper document or component.
public static class GraphReader
{
    public record Bounds(double x, double y, double width, double height);
    public record Port(string id, string label, string name, string description);
    public record Node(string id, string componentId, string name, string label, string description,
        string kind, Bounds bounds, Port[] inputs, Port[] outputs, string text, bool locked, bool hidden);
    public record Wire(string sourceNode, string sourcePort, string targetNode, string targetPort);
    public record Group(string id, string label, string color, string[] members);
    public record Graph(int version, Node[] nodes, Wire[] wires, Group[] groups, string[] notes);

    public static Graph Read(IEnumerable<XElement> objects)
    {
        var nodes = new List<Node>();
        var groups = new List<Group>();
        var pending = new List<(string source, string node, string port)>();
        var sourcePorts = new Dictionary<string, (string node, string port)>(StringComparer.OrdinalIgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var notes = new List<string>();
        foreach (var obj in objects.Take(501))
        {
            if (seen.Count >= 500) throw new Exception("Canvas supports at most 500 objects.");
            var c = Chunk(obj, "Container");
            if (c == null) continue;
            var id = Value(c, "InstanceGuid");
            if (!Guid.TryParse(id, out _) || !seen.Add(id)) { notes.Add("An object with a missing or duplicate ID could not be displayed."); continue; }
            var name = Clip(Value(obj, "Name"), 120);
            var label = Clip(Value(c, "NickName"), 120);
            if (string.IsNullOrWhiteSpace(label)) label = name;
            if (name == "Group")
            {
                var members = Items(c, "ID").Take(500).Select(x => x.Value).Where(x => Guid.TryParse(x, out _)).Distinct().ToArray();
                var rgb = Value(c, "Colour").Split(';');
                var color = rgb.Length == 4 && rgb.All(x => byte.TryParse(x, out _))
                    ? $"#{byte.Parse(rgb[1]):x2}{byte.Parse(rgb[2]):x2}{byte.Parse(rgb[3]):x2}" : "#9da77d";
                groups.Add(new(id, label, color, members));
                continue;
            }
            var attributes = Chunk(c, "Attributes");
            var rect = Items(attributes, "Bounds").FirstOrDefault();
            var pivot = Items(attributes, "Pivot").FirstOrDefault();
            var kind = Chunk(c, "Slider") != null ? "slider" : name == "Boolean Toggle" ? "toggle"
                : name == "Panel" ? "panel" : name == "Scribble" ? "scribble" : "component";
            var parameters = Chunk(c, "ParameterData") ?? c;
            var inputs = Chunks(parameters).Where(x => IsName(x, "param_input") || IsName(x, "InputParam")).OrderBy(Index).ToArray();
            var outputs = Chunks(parameters).Where(x => IsName(x, "param_output") || IsName(x, "OutputParam")).OrderBy(Index).ToArray();
            if (inputs.Length > 128 || outputs.Length > 128) throw new Exception("Canvas supports at most 128 ports per component.");
            var standalone = inputs.Length == 0 && outputs.Length == 0 && kind != "scribble";
            Port MakePort(XElement p, string suffix) => new(
                Guid.TryParse(Value(p, "InstanceGuid"), out _) ? Value(p, "InstanceGuid") : id + suffix,
                Clip(Value(p, "NickName"), 32), Clip(Value(p, "Name"), 120), Clip(Value(p, "Description"), 500));
            var inPorts = inputs.Select((p, i) => MakePort(p, ":in:" + i)).ToArray();
            var outPorts = outputs.Select((p, i) => MakePort(p, ":out:" + i)).ToArray();
            if (standalone)
            {
                if (kind == "component") kind = "parameter";
                outPorts = [new(id, "", name, "")];
                if (kind != "slider" && kind != "toggle") inPorts = [new(id + ":in", "", name, "")];
            }
            foreach (var p in outPorts) sourcePorts.TryAdd(p.id, (id, p.id));
            void AddSources(XElement p, string target)
            {
                foreach (var s in Items(p, "Source"))
                {
                    if (pending.Count >= 10000) throw new Exception("Canvas supports at most 10,000 wires.");
                    pending.Add((s.Value, id, target));
                }
            }
            for (var i = 0; i < inputs.Length; i++) AddSources(inputs[i], inPorts[i].id);
            if (standalone && inPorts.Length > 0) AddSources(c, inPorts[0].id);
            var defaultWidth = kind is "slider" or "panel" ? 200 : 80;
            var defaultHeight = kind is "slider" or "toggle" ? 24 : 80;
            var bounds = new Bounds(Coordinate(rect, "X", Coordinate(pivot, "X", (nodes.Count % 5) * 250)),
                Coordinate(rect, "Y", Coordinate(pivot, "Y", (nodes.Count / 5) * 150)),
                Math.Clamp(Coordinate(rect, "W", defaultWidth), 20, 4000), Math.Clamp(Coordinate(rect, "H", defaultHeight), 20, 4000));
            var text = kind is "panel" or "scribble" ? Clip(Value(c, "UserText") is { Length: > 0 } userText ? userText : Value(c, "Text"), 4000) : "";
            nodes.Add(new(id, Value(obj, "GUID"), name, label, Clip(Value(c, "Description"), 800), kind, bounds,
                inPorts, outPorts, text, Value(c, "Locked") == "true", Value(c, "Hidden") == "true"));
        }
        var wires = new List<Wire>();
        var unresolved = 0;
        foreach (var p in pending)
            if (sourcePorts.TryGetValue(p.source, out var s)) wires.Add(new(s.node, s.port, p.node, p.port));
            else unresolved++;
        if (unresolved > 0) notes.Add($"{unresolved} wire endpoint(s) were not present in the saved archive and could not be drawn.");
        return new(1, nodes.ToArray(), wires.Distinct().ToArray(), groups.ToArray(), notes.Distinct().ToArray());
    }
    static string Clip(string value, int max) => value.Length <= max ? value : value[..max] + "…";
    static bool IsName(XElement e, string name) => string.Equals((string?)e.Attribute("name"), name, StringComparison.OrdinalIgnoreCase);
    static int Index(XElement e) => int.TryParse((string?)e.Attribute("index"), out var i) ? i : 0;
    static IEnumerable<XElement> Chunks(XElement? e) => e?.Element("chunks")?.Elements("chunk") ?? [];
    static XElement? Chunk(XElement? e, string name) => Chunks(e).FirstOrDefault(x => IsName(x, name));
    static IEnumerable<XElement> Items(XElement? e, string name) => e?.Element("items")?.Elements("item").Where(x => IsName(x, name)) ?? [];
    static string Value(XElement? e, string name) => Items(e, name).FirstOrDefault()?.Value ?? "";
    static double Coordinate(XElement? e, string name, double fallback) =>
        double.TryParse(e?.Element(name)?.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n)
            ? Math.Clamp(n, -1000000, 1000000) : fallback;
}
