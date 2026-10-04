using System.Xml.Linq;
using System.Text.Json;

var file = args.Length > 0 ? args[0] : "worker/examples/parametric-sphere.ghx";
var xml = XDocument.Load(file);
var objects = xml.Descendants("chunk").First(x => (string?)x.Attribute("name") == "DefinitionObjects").Element("chunks")!.Elements("chunk").ToArray();
var graph = GraphReader.Read(objects);
Check(graph.nodes.Length == 4, "Real GHX has 4 nodes");
Check(graph.wires.Length == 3, "All 3 saved wires resolve");
Check(graph.notes.Length == 0, "No invented or missing ports");
var sphere = graph.nodes.Single(n => n.name == "Mesh Sphere");
Check(sphere.inputs.Length == 4 && sphere.outputs.Length == 1, "Component ports retain order and unconnected Base input");
Check(graph.wires.All(w => w.targetNode == sphere.id && sphere.inputs.Skip(1).Any(p => p.id == w.targetPort)), "Wires target actual R/U/V input GUIDs");
Check(graph.groups.Length == 2 && graph.groups[0].members.Length == 3, "Original groups and membership retained");
Check(graph.nodes.Select(n => n.bounds.y).Distinct().Count() == 4, "Saved positions retained");

var panelId = Guid.NewGuid().ToString();
XElement Item(string n, string v) => new("item", new XAttribute("name", n), v);
var panel = new XElement("chunk", new XAttribute("name", "Object"),
    new XElement("items", Item("Name", "Panel"), Item("GUID", Guid.NewGuid().ToString())),
    new XElement("chunks", new XElement("chunk", new XAttribute("name", "Container"),
        new XElement("items", Item("InstanceGuid", panelId), Item("NickName", "Result"), Item("UserText", "<script>not executable</script>"), Item("Source", sphere.outputs[0].id), Item("Locked", "true")),
        new XElement("chunks", new XElement("chunk", new XAttribute("name", "Attributes"), new XElement("items", new XElement("item", new XAttribute("name", "Bounds"), new XElement("X", "NaN"), new XElement("Y", "Infinity"), new XElement("W", "-10"), new XElement("H", "1e99"))))))));
var extra = GraphReader.Read(objects.Append(panel));
var p = extra.nodes.Single(n => n.id == panelId);
Check(extra.wires.Last().sourceNode == sphere.id && extra.wires.Last().targetNode == panelId, "Component output GUID resolves to standalone parameter");
Check(p.text == "<script>not executable</script>" && p.locked, "Panel text remains inert text; disabled flag preserved");
Check(double.IsFinite(p.bounds.x) && double.IsFinite(p.bounds.y) && p.bounds.width == 20 && p.bounds.height == 4000, "Hostile bounds bounded and finite");
panel.Descendants("item").Single(x => (string?)x.Attribute("name") == "Source").Value = Guid.NewGuid().ToString();
var unresolved = GraphReader.Read(objects.Append(panel));
Check(unresolved.wires.Length == 3 && unresolved.notes.Length == 1, "Unresolved endpoint explicitly reported, never guessed");

var variant = new XElement(objects.Single(x => x.Descendants("item").Any(i => (string?)i.Attribute("name") == "InstanceGuid" && i.Value == sphere.id)));
var container = variant.Element("chunks")!.Elements("chunk").Single(x => (string?)x.Attribute("name") == "Container");
var ports = container.Element("chunks")!.Elements("chunk").Where(x => ((string?)x.Attribute("name"))?.StartsWith("param_") == true).ToArray();
foreach (var port in ports) { port.Remove(); port.SetAttributeValue("name", (string?)port.Attribute("name") == "param_input" ? "InputParam" : "OutputParam"); }
container.Element("chunks")!.Add(new XElement("chunk", new XAttribute("name", "ParameterData"), new XElement("chunks", ports)));
var v = GraphReader.Read(objects.Where(x => !x.Descendants("item").Any(i => (string?)i.Attribute("name") == "InstanceGuid" && i.Value == sphere.id)).Append(variant));
Check(v.wires.Length == 3 && v.nodes.Single(n => n.id == sphere.id).inputs.Length == 4, "ParameterData archive format supported");
if (args.Length > 1) File.WriteAllText(args[1], JsonSerializer.Serialize(graph, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine("GraphReader: all 12 archive assertions passed.");
static void Check(bool success, string message) { if (!success) throw new Exception(message); Console.WriteLine("PASS " + message); }
