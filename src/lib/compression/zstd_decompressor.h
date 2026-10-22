/* This code is subject to the terms of the Mozilla Public License, v.2.0. http://mozilla.org/MPL/2.0/. */
#pragma once

#include "zstd_dstream.h"

#include "zstd/zstd.h"
#include <array>
#include <sstream>
#include <vector>

namespace cimbar {

template <typename STREAM>
class zstd_decompressor : public STREAM
{
public:
	using STREAM::STREAM; // pull in constructors

public:
	bool write_once()
	{
		// pending input means the stream is not finished, even if the previous
		// frame already reported its end (concatenated frames).
		if (!_inBuff.empty())
			_frameEnded = false;

		if (_inBuff.empty())
			return flush_once();

		size_t writeLen = CHUNK_SIZE;
		while (_inBuff.size() > 0)
		{
			if (_inBuff.size() < CHUNK_SIZE)
				writeLen = _inBuff.size();

			ZSTD_inBuffer input = {_inBuff.data(), writeLen, 0};
			ZSTD_outBuffer output = {_outBuff.data(), _outBuff.size(), 0};

			while (input.pos < input.size)
			{
				size_t res = ZSTD_decompressStream(_ds, &output, &input);
				if (ZSTD_isError(res))
				{
					_lastError << " failed decompress? " << ZSTD_getErrorName(res);
					_isError = true;
					return false; // we're not making progress, mayday mayday
				}
				if (res == 0)
				{
					_frameEnded = true;
					if (input.pos < input.size)
						_frameEnded = false; // a new frame starts in this same call
				}
				if (output.pos > 0)
				{
					STREAM::write(_outBuff.data(), output.pos);
					_inBuff = std::string_view(_inBuff.data() + input.pos, _inBuff.size() - input.pos);
					return true;
				}
			}
			_inBuff = std::string_view(_inBuff.data() + input.size, _inBuff.size() - input.size);
		}
		// input consumed: still need one more (empty-input) call for the
		// frame-end signal, and to drain anything zstd holds back
		return flush_once();
	}

	bool init_decompress(const char* data, size_t len)
	{
		if (!_ds)
			return false;
		if (len > 0)
			_frameEnded = false; // new input may start a new frame
		_inBuff = std::string_view(data, len);
		return true;
	}

	bool write(const char* data, size_t len)
	{
		if (!init_decompress(data, len))
			return false;
		while (_inBuff.size() > 0)
			if (!write_once())
				return false;
		return true;
	}

	template <typename INSTREAM>
	size_t decompress(INSTREAM& source)
	{
		if (!_ds)
			return 0;

		std::vector<char> srcBuff(CHUNK_SIZE);
		size_t totalBytesRead = 0;
		while (source)
		{
			source.read(srcBuff.data(), srcBuff.size());
			std::streamsize bytesRead = source.gcount();
			if (bytesRead <= 0)
			{
				_lastError << " no bytes read??? :( " << bytesRead;
				break;
			}
			totalBytesRead += bytesRead;

			if (!write(srcBuff.data(), bytesRead))
				break;
		}
		return totalBytesRead;
	}

	bool good() const
	{
		return !_isError and STREAM::good();
	}

	// Whether the last compressed frame has been fully decoded and flushed.
	// Only true after zstd itself reports the end of the frame (res == 0):
	// a truncated stream leaves this false, so "no more bytes" can never be
	// mistaken for "complete".
	bool frame_ended() const
	{
		return _frameEnded;
	}

	// Empty-input flush: picks up the frame-end signal and drains output
	// zstd still holds. Never errors on an incomplete stream.
	bool flush_once()
	{
		if (_frameEnded)
			return true;
		ZSTD_inBuffer input = {nullptr, 0, 0};
		ZSTD_outBuffer output = {_outBuff.data(), _outBuff.size(), 0};
		size_t res = ZSTD_decompressStream(_ds, &output, &input);
		if (ZSTD_isError(res))
		{
			_lastError << " failed decompress? " << ZSTD_getErrorName(res);
			_isError = true;
			return false;
		}
		if (res == 0)
			_frameEnded = true;
		if (output.pos > 0)
			STREAM::write(_outBuff.data(), output.pos);
		return true;
	}

	std::string last_error() const
	{
		return _lastError.str();
	}	

protected:
	const size_t CHUNK_SIZE = ZSTD_DStreamInSize();
	zstd_dstream _ds;
	std::vector<char> _outBuff = std::vector<char>(ZSTD_DStreamOutSize());
	std::string_view _inBuff;

	bool _frameEnded = false;
	bool _isError = false;
	std::stringstream _lastError;
};

}
