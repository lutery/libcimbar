/* This code is subject to the terms of the Mozilla Public License, v.2.0. http://mozilla.org/MPL/2.0/. */
#include "unittest.h"

#include "zstd_decompressor.h"
#include "zstd/zstd.h"

#include "serialize/format.h"
#include "util/File.h"
#include "util/MakeTempDirectory.h"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using std::string;
using namespace cimbar;
using namespace std;

TEST_CASE( "zstd_decompressorTest/testDecompress.Small", "[unit]" )
{
	char inputC[] = "(\xb5" "/\xfd" "`\xe8\x02\x8d\x00\x00" "P0123456789\x01\x00\xdb[\x15$";
	std::stringstream ss;
	ss << string(inputC, 27);

	std::stringstream expectedOutput;
	for (int i = 0; i < 1000; i+=10)
		expectedOutput << "0123456789";

	zstd_decompressor<std::stringstream> dec;
	assertEquals( 27, dec.decompress(ss) );

	std::stringstream output;
	output << dec.rdbuf();

	assertEquals( 1000, output.str().size() );
	assertEquals( expectedOutput.str(), output.str() );
}

TEST_CASE( "zstd_decompressorTest/testDecompress.Big", "[unit]" )
{
	char inputC[] = "(\xb5/\xfd\xa0\xa0\x86\x01\x00\x95\x00\x00" "P0123456789\x01\x00\x93\x86\xcd\x0b\x12";
	std::stringstream ss;
	ss << string(inputC, 30);

	std::stringstream expectedOutput;
	for (int i = 0; i < 100000; i+=10)
		expectedOutput << "0123456789";

	zstd_decompressor<std::stringstream> dec;
	assertEquals( 30, dec.decompress(ss) );

	std::stringstream output;
	output << dec.rdbuf();

	assertEquals( 100000, output.str().size() );
	assertEquals( expectedOutput.str(), output.str() );
}

TEST_CASE( "zstd_decompressorTest/testDecompress.FromBuff", "[unit]" )
{
	char inputC[] = "(\xb5/\xfd\xa0\xa0\x86\x01\x00\x95\x00\x00" "P0123456789\x01\x00\x93\x86\xcd\x0b\x12";
	string input(inputC, 30);

	std::stringstream expectedOutput;
	for (int i = 0; i < 100000; i+=10)
		expectedOutput << "0123456789";

	zstd_decompressor<std::stringstream> dec;
	assertTrue( dec.write(input.data(), input.size()) );

	std::stringstream output;
	output << dec.rdbuf();

	assertEquals( 100000, output.str().size() );
	assertEquals( expectedOutput.str(), output.str() );
}

TEST_CASE( "zstd_decompressorTest/testDecompress.ToFile", "[unit]" )
{
	MakeTempDirectory tempdir;

	char inputC[] = "(\xb5/\xfd\xa0\xa0\x86\x01\x00\x95\x00\x00" "P0123456789\x01\x00\x93\x86\xcd\x0b\x12";
	std::stringstream ss;
	ss << string(inputC, 30);

	std::stringstream expectedOutput;
	for (int i = 0; i < 100000; i+=10)
		expectedOutput << "0123456789";

	{
		zstd_decompressor<std::ofstream> dec(tempdir.path() / "decompress.txt");
		assertEquals( 30, dec.decompress(ss) );
	}

	string actual = File(tempdir.path() / "decompress.txt").read_all();
	assertEquals( expectedOutput.str(), actual );
}

TEST_CASE( "zstd_decompressorTest/testDecompress.Pad", "[unit]" )
{
	char inputC[] = "(\xb5" "/\xfd" "`\xe8\x02\x8d\x00\x00" "P0123456789\x01\x00\xdb[\x15$";
	std::stringstream ss;
	ss << string(inputC, 27);

	std::stringstream expectedOutput;
	for (int i = 0; i < 1000; i+=10)
		expectedOutput << "0123456789";

	zstd_decompressor<std::stringstream> dec;
	assertEquals( 27, dec.decompress(ss) );

	std::stringstream output;
	output << dec.rdbuf();

	assertEquals( 1000, output.str().size() );
	assertEquals( expectedOutput.str(), output.str() );
}

// ---------------------------------------------------------------------------
// desktop-recv strict EOF adaptation (UT-049..UT-054)
// All fixtures are built with the real vendored zstd; no fake decoder.
// ---------------------------------------------------------------------------

namespace {

	std::vector<char> make_zstd_stream(const std::string& payload)
	{
		size_t bound = ZSTD_compressBound(payload.size());
		std::vector<char> out(bound);
		size_t n = ZSTD_compress(out.data(), out.size(), payload.data(), payload.size(), 1);
		if (ZSTD_isError(n))
			return std::vector<char>();
		out.resize(n);
		return out;
	}

	std::string patterned_bytes(size_t len)
	{
		std::string payload;
		payload.reserve(len);
		for (size_t i = 0; i < len; ++i)
			payload += static_cast<char>('a' + (i % 26));
		return payload;
	}

	std::string take_output(zstd_decompressor<std::stringstream>& dec)
	{
		std::string out = dec.str();
		dec.str(std::string());
		return out;
	}

	// Drain whatever the decompressor has produced so far, without feeding input.
	// Stops when a flush attempt yields no bytes.
	std::string drain_without_input(zstd_decompressor<std::stringstream>& dec)
	{
		std::string drained;
		for (int i = 0; i < 10000; ++i)
		{
			if (!dec.write_once())
				break;
			std::string chunk = take_output(dec);
			if (chunk.empty())
				break;
			drained += chunk;
		}
		return drained;
	}
}

// UT-049: a valid compressed stream decodes byte-exactly and only reports
// completion after the frame is really finished.
TEST_CASE( "zstd_decompressorTest/testStrictEof.RoundTrip", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(300000);
	std::vector<char> compressed = make_zstd_stream(payload);
	assertTrue( compressed.size() > 0 );

	zstd_decompressor<std::stringstream> dec;
	assertTrue( dec.write(compressed.data(), compressed.size()) );

	std::string drained = take_output(dec) + drain_without_input(dec);

	assertEquals( payload.size(), drained.size() );
	assertEquals( payload, drained );
	assertTrue( dec.frame_ended() );
}

// UT-050: a corrupted stream surfaces an error instead of looking complete.
TEST_CASE( "zstd_decompressorTest/testStrictEof.Corrupt", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(50000);
	std::vector<char> compressed = make_zstd_stream(payload);
	assertTrue( compressed.size() > 8 );

	compressed[0] ^= 0xFF; // breaks the frame header deterministically

	zstd_decompressor<std::stringstream> dec;
	bool ok = dec.write(compressed.data(), compressed.size());
	assertFalse( ok );
	assertFalse( dec.good() );
}

// UT-051: legal truncations are incomplete, not silently complete.
TEST_CASE( "zstd_decompressorTest/testStrictEof.Truncated", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(300000);
	std::vector<char> compressed = make_zstd_stream(payload);
	assertTrue( compressed.size() > 16 );

	size_t cuts[] = {4, compressed.size()/2, compressed.size()-1};
	for (size_t cut : cuts)
	{
		zstd_decompressor<std::stringstream> dec;
		assertTrue( dec.write(compressed.data(), cut) ); // no zstd error: just incomplete
		assertFalse( dec.frame_ended() );                // the contract under test
	}
}

// UT-052: output still buffered inside zstd is flushed after input is exhausted.
TEST_CASE( "zstd_decompressorTest/testStrictEof.FlushAfterInput", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(300000);
	std::vector<char> compressed = make_zstd_stream(payload);

	zstd_decompressor<std::stringstream> dec;
	assertTrue( dec.write(compressed.data(), compressed.size()) );

	std::string first = take_output(dec);
	assertTrue( first.size() > 0 );

	std::string rest = drain_without_input(dec);

	assertEquals( payload.size(), first.size() + rest.size() );
	assertEquals( payload, first + rest );
	assertTrue( dec.frame_ended() );
}

// UT-053: repeated reads never lose bytes and stay stable after completion.
TEST_CASE( "zstd_decompressorTest/testStrictEof.RepeatedRead", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(200000);
	std::vector<char> compressed = make_zstd_stream(payload);

	zstd_decompressor<std::stringstream> dec;
	assertTrue( dec.write(compressed.data(), compressed.size()) );

	std::string drained;
	for (int i = 0; i < 10000; ++i)
	{
		dec.write_once();
		std::string chunk = take_output(dec);
		if (chunk.empty() && dec.frame_ended())
			break;
		drained += chunk;
	}
	assertEquals( payload.size(), drained.size() );
	assertEquals( payload, drained );

	for (int i = 0; i < 3; ++i)
	{
		assertTrue( dec.frame_ended() );
		dec.write_once();
		assertEquals( std::string(), dec.str() );
	}
}

// UT-054: chunked writes must not report a whole-stream truncation at chunk
// boundaries; existing send paths stay compatible.
TEST_CASE( "zstd_decompressorTest/testStrictEof.ChunkedWrite", "[unit][desktop-recv]" )
{
	std::string payload = patterned_bytes(200000);
	std::vector<char> compressed = make_zstd_stream(payload);
	assertTrue( compressed.size() > 16 );

	zstd_decompressor<std::stringstream> dec;
	std::string drained;
	for (size_t i = 0; i < compressed.size(); i += 7)
	{
		size_t len = std::min<size_t>(7, compressed.size() - i);
		assertTrue( dec.write(compressed.data() + i, len) );
		drained += take_output(dec);
	}
	drained += drain_without_input(dec);

	assertEquals( payload, drained );
	assertTrue( dec.frame_ended() );
}

