using GH_IO.Serialization;
using System.Xml.Linq;
using System.Globalization;
using System.Text.Json;

try
{
    var archive = new GH_Archive();
    if (!archive.ReadFromFile(args[0])) throw new Exception("Could not read Grasshopper archive.");
    var xml = XDocument.Parse(archive.Serialize_Xml());
    if (args.Length > 1 && args[1] == "--xml") { Console.Write(xml); return; }
    var definition = xml.Descendants("chunk").First(x => (string?)x.Attribute("name") == "Definition");
    var objects = Chunk(definition, "DefinitionObjects") ?? throw new Exception("No definition objects found.");
    var objectList = objects.Element("chunks") ?? throw new Exception("Empty definition.");
    var originalObjects = objectList.Elements("chunk").ToArray();
    if (originalObjects.Length > 500) throw new Exception("This service supports at most 500 components per definition.");
    var policyFile = Path.Combine(AppContext.BaseDirectory, "component-policy.json");
    var policy = JsonDocument.Parse(File.ReadAllText(policyFile)).RootElement.EnumerateArray().Select(x => x.GetProperty("id").GetString()!).ToHashSet(StringComparer.OrdinalIgnoreCase);
    foreach (var obj in originalObjects)
        if (!policy.Contains(Value(obj, "GUID"))) throw new Exception($"Unsupported component: {Value(obj, "Name")} ({Value(obj, "GUID")}). Public uploads accept only the reviewed built-in component list. Scripts, clusters and plugins are not supported.");
    if (xml.Descendants("chunk").Count(x => (string?)x.Attribute("name") == "DefinitionObjects") != 1)
        throw new Exception("Nested definitions and clusters are not supported.");
    foreach (var item in xml.Descendants())
    {
        var n = ((string?)item.Attribute("name") ?? "").ToLowerInvariant();
        if (n.Contains("script") || n.Contains("assembly") || n.Contains("cluster") || n.Contains("expression"))
            throw new Exception("Embedded scripts, assemblies, clusters and expressions are not supported by the public service.");
    }
    // Preserve only the definition structure consumed by the reviewed components.
    foreach (var chunk in definition.Element("chunks")!.Elements("chunk").ToArray())
        if (!new[] { "DefinitionObjects", "DocumentHeader", "DefinitionProperties" }.Contains((string?)chunk.Attribute("name"))) chunk.Remove();
    var controls = new List<object>();
    var outputs = new List<object>();
    var warnings = new List<string>();
    var groupedInputs = new Dictionary<string, string>();
    var explicitOutputs = false;
    foreach (var obj in originalObjects)
    {
        var container = Chunk(obj, "Container");
        var nickname = Value(container, "NickName");
        if (Value(obj, "Name") == "Group")
        {
            if (nickname.Contains("RH_IN")) groupedInputs[Value(container, "ID")] = nickname;
            if (nickname.Contains("RH_OUT")) explicitOutputs = true;
        }
        if (Value(obj, "Name").Contains("Context Bake")) explicitOutputs = true;
    }
    foreach (var obj in originalObjects)
    {
        var c = Chunk(obj, "Container");
        if (c == null || Value(c, "Locked") == "true") continue;
        var name = Value(obj, "Name");
        var id = Value(c, "InstanceGuid");
        var label = Value(c, "NickName");
        if (string.IsNullOrWhiteSpace(label)) label = name;
        var slider = Chunk(c, "Slider");
        if (slider != null)
        {
            var inputName = groupedInputs.GetValueOrDefault(id) ?? $"RH_IN:{label}_{id[..8]}";
            if (!groupedInputs.ContainsKey(id)) AddGroup(inputName, id);
            var interval = (int)Number(slider, "Interval", 0);
            var digits = (int)Number(slider, "Digits", 3);
            if (!double.IsFinite(Number(slider,"Min",0)) || !double.IsFinite(Number(slider,"Max",100)) || Number(slider,"Min",0)>Number(slider,"Max",100)) throw new Exception("Invalid slider range.");
            controls.Add(new { name = inputName, label, kind = "number", min = Number(slider, "Min", 0), max = Number(slider, "Max", 100), value = Number(slider, "Value", 0), step = interval >= 2 ? 2 : interval == 1 ? 1 : Math.Pow(10, -digits), interval });
        }
        else if (name == "Boolean Toggle")
        {
            var inputName = groupedInputs.GetValueOrDefault(id) ?? $"RH_IN:{label}_{id[..8]}";
            if (!groupedInputs.ContainsKey(id)) AddGroup(inputName, id);
            controls.Add(new { name = inputName, label, kind = "boolean", value = Value(c, "Value") == "true" });
        }
        else if (!explicitOutputs && Value(c, "Hidden") != "true" && Guid.TryParse(id, out _) &&
                 !new[] { "Group", "Panel", "Scribble", "Value List", "Number Slider", "Relay", "Timer", "Button", "Data Dam", "Boolean Toggle" }.Contains(name))
        {
            var outputName = $"RH_OUT:{label}_{id[..8]}";
            AddGroup(outputName, id);
            outputs.Add(new { name = outputName, label });
        }
    }
    var objectCount = objectList.Elements("chunk").Count();
    objects.Element("items")!.Elements("item").First(x => (string?)x.Attribute("name") == "ObjectCount").Value = objectCount.ToString();
    foreach (var list in xml.Descendants().Where(x => x.Name == "items" || x.Name == "chunks")) list.SetAttributeValue("count", list.Elements().Count());
    var prepared = new GH_Archive();
    if (!prepared.Deserialize_Xml(xml.ToString())) throw new Exception("Could not prepare definition for Compute.");
    var libraries = Chunk(definition, "GHALibraries")?.Descendants("item").Where(x => (string?)x.Attribute("name") == "Name").Select(x => x.Value).Distinct().ToArray() ?? [];
    if (libraries.Length > 0) warnings.Add("Required libraries: " + string.Join(", ", libraries) + ". They must be installed on the Compute server.");
    if (controls.Count == 0) warnings.Add("No top-level sliders or toggles found. Sliders inside clusters are not exposed automatically.");
    Console.Write(JsonSerializer.Serialize(new { algo = Convert.ToBase64String(prepared.Serialize_Binary()), controls, outputs, libraries, warnings }));

    void AddGroup(string name, string id)
    {
        var index = objectList.Elements("chunk").Count();
        objectList.Add(new XElement("chunk", new XAttribute("name", "Object"), new XAttribute("index", index),
            new XElement("items", Item("GUID", "gh_guid", 9, "c552a431-af5b-46a9-a8a4-0fcbc27ef596"), Item("Name", "gh_string", 10, "Group")),
            new XElement("chunks", new XElement("chunk", new XAttribute("name", "Container"),
                new XElement("items", Item("Border", "gh_int32", 3, "1"), new XElement("item", new XAttribute("name", "Colour"), new XAttribute("type_name", "gh_drawing_color"), new XAttribute("type_code", 36), new XElement("ARGB", "150;140;180;130")), Item("Description", "gh_string", 10, "Compute preview"), Item("InstanceGuid", "gh_guid", 9, Guid.NewGuid().ToString()), Item("Name", "gh_string", 10, "Group"), Item("NickName", "gh_string", 10, name), Item("ID_Count", "gh_int32", 3, "1"), new XElement("item", new XAttribute("name", "ID"), new XAttribute("index", 0), new XAttribute("type_name", "gh_guid"), new XAttribute("type_code", 9), id)),
                new XElement("chunks", new XElement("chunk", new XAttribute("name", "Attributes")))))));
    }
}
catch (Exception ex) { Console.Error.WriteLine(ex.Message); Environment.ExitCode = 1; }

static XElement? Chunk(XElement parent, string name) => parent.Element("chunks")?.Elements("chunk").FirstOrDefault(x => (string?)x.Attribute("name") == name);
static string Value(XElement? parent, string name) => parent?.Element("items")?.Elements("item").FirstOrDefault(x => (string?)x.Attribute("name") == name)?.Value ?? "";
static double Number(XElement parent, string name, double fallback) => double.TryParse(Value(parent, name), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : fallback;
static XElement Item(string name, string type, int code, string value) => new("item", new XAttribute("name", name), new XAttribute("type_name", type), new XAttribute("type_code", code), value);
