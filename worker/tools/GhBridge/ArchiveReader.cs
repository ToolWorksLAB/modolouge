using System.Xml;
using System.Xml.Linq;
using GH_IO.Serialization;
using GH_IO.Types;

static class ArchiveReader
{
    const int MaxBytes = 64 * 1024 * 1024;
    public static XDocument Read(string path)
    {
        if (new FileInfo(path).Length > 20 * 1024 * 1024) throw new Exception("Maximum archive size is 20 MB.");
        var archive = new GH_Archive();
        if (Path.GetExtension(path).Equals(".ghx", StringComparison.OrdinalIgnoreCase))
        {
            using var reader = XmlReader.Create(path, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxBytes });
            var xml = XDocument.Load(reader);
            foreach (var bitmap in xml.Descendants("item").Where(x => (string?)x.Attribute("type_code") == "37").ToArray()) bitmap.Remove();
            Counts(xml);
            return xml;
        }
        var data = File.ReadAllBytes(path);
        byte[] expanded;
        using (var compressed = new MemoryStream(data))
        using (var inflater = new System.IO.Compression.DeflateStream(compressed, System.IO.Compression.CompressionMode.Decompress))
        using (var bounded = new MemoryStream())
        {
            var buffer = new byte[8192]; int read;
            while ((read = inflater.Read(buffer)) > 0)
            {
                if (bounded.Length + read > MaxBytes) throw new Exception("Expanded archive exceeds 64 MB.");
                bounded.Write(buffer, 0, read);
            }
            expanded = bounded.ToArray();
        }
        using var input = new BinaryReader(new MemoryStream(expanded));
        using var output = new MemoryStream();
        using var writer = new BinaryWriter(output, System.Text.Encoding.UTF8, true);
        int total = 0;
        CopyChunk(input, writer, 0, ref total);
        if (input.BaseStream.Position != input.BaseStream.Length) throw new Exception("Unexpected trailing archive data.");
        writer.Flush();
        if (!archive.Deserialize_Binary(output.ToArray())) throw new Exception("Could not read binary archive.");
        return XDocument.Parse(archive.Serialize_Xml());
    }
    static void CopyChunk(BinaryReader input, BinaryWriter output, int depth, ref int total)
    {
        if (depth > 64 || ++total > 100000) throw new Exception("Archive nesting exceeds service limits.");
        var name = input.ReadString(); var index = input.ReadInt32(); var itemCount = input.ReadInt32(); var chunkCount = input.ReadInt32();
        if (name.Length > 1024 || itemCount < 0 || itemCount > 100000 || chunkCount < 0 || chunkCount > 100000) throw new Exception("Invalid archive structure.");
        using var items = new MemoryStream(); using var itemWriter = new BinaryWriter(items, System.Text.Encoding.UTF8, true);
        int kept = 0;
        for (int i = 0; i < itemCount; i++)
        {
            if (++total > 100000) throw new Exception("Archive exceeds service limits.");
            var start = input.BaseStream.Position;
            _ = input.ReadString(); _ = input.ReadInt32(); var type = input.ReadInt32();
            if (type == 37)
            {
                var size = input.ReadInt32();
                if (size < 0 || size > MaxBytes || input.BaseStream.Position + size > input.BaseStream.Length) throw new Exception("Invalid thumbnail size.");
                input.BaseStream.Position += size;
            }
            else
            {
                input.BaseStream.Position = start;
                var item = GH_Item.CreateFrom(input); item.Write(itemWriter); kept++;
            }
        }
        itemWriter.Flush(); output.Write(name); output.Write(index); output.Write(kept); output.Write(chunkCount); output.Write(items.ToArray());
        for (int i = 0; i < chunkCount; i++) CopyChunk(input, output, depth + 1, ref total);
    }
    public static void Counts(XDocument xml)
    { foreach (var list in xml.Descendants().Where(x => x.Name == "items" || x.Name == "chunks")) list.SetAttributeValue("count", list.Elements().Count()); }
}
