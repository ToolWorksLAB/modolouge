using System.Xml.Linq;
using System.Text.Json;

var passed = 0;
foreach (var expression in new[] { "", "-x", " x * (2 + 3.5) ", "-(x/2)", ".5+x^2", "1e-3*x", "2%3" })
    Check(ArithmeticExpression.IsAllowed(expression), "Allow arithmetic: " + expression);
foreach (var expression in new[] { "x.ToString()", "System.IO.File.ReadAllText(x)", "sin(x)", "x;1", "x +", "(x", "x)", "xy", "xx", "1e500", "1e+x", "\"hello\"", "x[0]", new string('(', 100) + "x" + new string(')', 100), new string('1', 257) })
    Check(!ArithmeticExpression.IsAllowed(expression), "Reject unrestricted or malformed expression");

var policy = JsonDocument.Parse(File.ReadAllText("worker/component-policy.json")).RootElement.EnumerateArray().Select(x => x.GetProperty("id").GetString()!).ToHashSet(StringComparer.OrdinalIgnoreCase);
Check(policy.Contains("d93100b6-d50b-40b2-831a-814659dc38e3"), "Rectangle enabled");
var safe = XDocument.Parse("<archive><chunk name='DefinitionObjects'><chunks /></chunk><item name='InternalExpression'>-x</item><item name='Stream'>false</item></archive>");
ArchivePolicy.Validate(safe, [], policy);
Reject(new XDocument(new XElement(safe.Root!)), x => x.Root!.Add(new XElement("item", new XAttribute("name", "InternalExpression"), "eval(x)")), "Expression functions rejected");
Reject(new XDocument(new XElement(safe.Root!)), x => x.Root!.Add(new XElement("item", new XAttribute("name", "ScriptSource"), "arbitrary")), "Scripts rejected");
Reject(new XDocument(new XElement(safe.Root!)), x => x.Root!.Add(new XElement("item", new XAttribute("name", "StreamPath"), "/tmp/file")), "Panel file streaming rejected");
Reject(new XDocument(new XElement(safe.Root!)), x => x.Root!.Add(new XElement("chunk", new XAttribute("name", "DefinitionObjects"))), "Nested definitions rejected");

var source = Node("geometry", "919e146f-30ae-4aae-be34-4d72f555e7da", true);
var material = Node("material", "9c53bac0-ba66-40bd-8154-ce9829b9db1a", false);
var preview = Node("preview", "537b0419-bbc2-4ff4-bf08-afe526367b2c", true) with { inputs = [new("geometry-in", "G", "Geometry", ""), new("material-in", "M", "Material", "")] };
var graph = new GraphReader.Graph(1, [source, material, preview], [new("geometry", "geometry", "preview", "geometry-in"), new("material", "material", "preview", "material-in")], [], []);
var output = PreviewSelection.Sources(graph, out var fallback);
Check(fallback && output.SetEquals(["geometry"]), "Hidden Custom Preview includes its hidden geometry source, not its material");
var empty = PreviewSelection.Sources(graph with { nodes = [source, material] }, out fallback);
Check(empty.Count == 0 && !fallback, "Definitions without Custom Preview retain normal output selection");
var visiblePreview = preview with { id = "visible-preview", hidden = false, inputs = [new("visible-in", "G", "Geometry", "")] };
var preferred = PreviewSelection.Sources(graph with { nodes = [source, material, preview, visiblePreview], wires = [..graph.wires, new("other-geometry", "other-port", "visible-preview", "visible-in")] }, out fallback);
Check(!fallback && preferred.SetEquals(["other-geometry"]), "Visible previews take precedence over hidden previews");
var locked = PreviewSelection.Sources(graph with { nodes = [source, preview with { locked = true }] }, out fallback);
Check(locked.Count == 0 && !fallback, "Locked Custom Preview is ignored");
var generic = XElement.Parse("<chunk><items><item name='GUID'>8ec86459-bf01-4409-baee-174d0d2b13d0</item></items><chunks><chunk name='Container'><chunks><chunk name='PersistentData'><chunks><chunk name='Branch'/></chunks></chunk></chunks></chunk></chunks></chunk>");
var genericRejected = false;
try { ArchivePolicy.Validate(safe, [generic], policy); } catch (Exception e) { genericRejected = e.Message.Contains("Internalized generic"); }
Check(genericRejected, "Internalized generic objects rejected before deserialization");

// The owner's original file stays private. Optionally pass its locally decoded
// GHX to run the same policy and output-selection benchmark on the real archive.
if (args.Length > 0)
{
    var shelf = XDocument.Load(args[0]);
    var objects = shelf.Descendants("chunk").Single(x => (string?)x.Attribute("name") == "DefinitionObjects").Element("chunks")!.Elements("chunk").ToArray();
    ArchivePolicy.Validate(shelf, objects, policy);
    var g = GraphReader.Read(objects);
    Check(objects.Length == 86 && g.nodes.Length == 60 && g.groups.Length == 26, "Shelf benchmark: 86 objects, 60 nodes, 26 groups");
    Check(g.nodes.Count(n => n.kind == "slider") == 6, "Shelf benchmark retains six numeric sliders");
    Check(g.notes.Length == 0, "Shelf benchmark: every saved wire resolves");
    var sources = PreviewSelection.Sources(g, out fallback);
    Check(fallback && sources.Count == 3 && g.nodes.Where(n => sources.Contains(n.id)).All(n => n.name == "Brep"), "Shelf benchmark: all three final Brep outputs selected");
    var unknown = new XElement(objects[0]);
    unknown.Element("items")!.Elements("item").Single(x => (string?)x.Attribute("name") == "GUID").Value = Guid.NewGuid().ToString();
    var rejected = false;
    try { ArchivePolicy.Validate(shelf, [unknown], policy); } catch (Exception e) { rejected = e.Message.Contains("does not necessarily mean"); }
    Check(rejected, "Unknown component rejected with accurate compatibility explanation");
    var mapper = objects.Single(o => o.Element("items")!.Elements("item").Any(i => (string?)i.Attribute("name") == "GUID" && i.Value == ArchivePolicy.GraphMapper));
    mapper.Descendants("item").Single(i => (string?)i.Attribute("name") == "container_id").Value = Guid.NewGuid().ToString();
    rejected = false;
    try { ArchivePolicy.Validate(shelf, objects, policy); } catch (Exception e) { rejected = e.Message.Contains("Graph Mapper curve"); }
    Check(rejected, "Unreviewed Graph Mapper implementation rejected");
}
var sid="11111111-1111-4111-8111-111111111111";
var cloneId="22222222-2222-4222-8222-222222222222";
var editXml=XDocument.Parse($"<archive><chunk name='DefinitionObjects'><items><item name='ObjectCount'>1</item></items><chunks><chunk name='Object' index='0'><items><item name='GUID'>57da07bd-ecab-415d-9d86-af36d7073abc</item><item name='Name'>Number Slider</item></items><chunks><chunk name='Container'><items><item name='InstanceGuid'>{sid}</item><item name='NickName'>Size</item></items><chunks><chunk name='Slider'><items><item name='Min'>1</item><item name='Max'>20</item><item name='Value'>5</item></items></chunk></chunks></chunk></chunks></chunk></chunks></chunk></archive>");
void Edit(XDocument doc,object[] ops) => GraphEdits.Apply(doc,JsonSerializer.SerializeToElement(ops));
Edit(editXml,[new {op="slider",nodeId=sid,value=7}]);
Check(editXml.Descendants("item").Single(x=>(string?)x.Attribute("name")=="Value").Value=="7","Graph edit changes the saved slider value");
Edit(editXml,[new {op="clone",nodeId=sid,newId=cloneId,text="Other size"}]);
var editedGraph=GraphReader.Read(editXml.Descendants("chunk").Where(x=>(string?)x.Attribute("name")=="Object"));
Check(editedGraph.nodes.Length==2 && editedGraph.nodes.Any(n=>n.id==cloneId && n.label=="Other size"),"Clone has a new identity and label");
Edit(editXml,[new {op="remove",nodeId=cloneId}]);
Check(editXml.Descendants("item").Single(x=>(string?)x.Attribute("name")=="ObjectCount").Value=="1","Removing a node updates archive counts");
var before=editXml.ToString();
var invalid=false;
try{Edit(new XDocument(editXml),[new {op="slider",nodeId=sid,value=100}]);}catch{invalid=true;}
Check(invalid && editXml.ToString()==before,"An out-of-range candidate fails without changing the original");
invalid=false;try{Edit(new XDocument(editXml),[new {op="execute",nodeId=sid}]);}catch{invalid=true;}
Check(invalid,"Unknown edit operations rejected");
Console.WriteLine($"ArchivePolicy: {passed} assertions passed.");
void Check(bool success, string message) { if (!success) throw new Exception(message); passed++; Console.WriteLine("PASS " + message); }
void Reject(XDocument xml, Action<XDocument> mutate, string message)
{
    mutate(xml); var rejected = false;
    try { ArchivePolicy.Validate(xml, [], policy); } catch { rejected = true; }
    Check(rejected, message);
}
static GraphReader.Node Node(string id, string component, bool hidden) => new(id, component, "", "", "", "component", new(0,0,100,100), [], [new(id,"","","")], "", false, hidden);
