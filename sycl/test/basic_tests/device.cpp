// RUN: %clangxx -fsycl %s -o %t.out
// RUN: %RUN_ON_HOST %t.out

// This test performs basic check of the SYCL device class.

#include <cassert>
#include <iostream>
#include <sycl/sycl.hpp>
#include <utility>

using namespace sycl;

std::string get_type(const device &dev) {
  if (dev.is_host()) {
    return "host";
  } else if (dev.is_gpu()) {
    return "OpenCL.GPU";
  } else if (dev.is_accelerator()) {
    return "OpenCL.ACC";
  } else {
    return "OpenCL.CPU";
  }
}

int main() {
  device d;
  std::cout << "Default device type: " << get_type(d) << std::endl;

  int i = 1;
  std::cout << "Get all devices in the system" << std::endl;
  for (const auto &dev : device::get_devices()) {
    std::cout << "Device " << i++ << " is available: " << get_type(dev)
              << std::endl;
  }
  i = 1;
  std::cout << "Get host devices in the system" << std::endl;
  for (const auto &dev : device::get_devices(info::device_type::host)) {
    std::cout << "Device " << i++ << " is available: " << get_type(dev)
              << std::endl;
  }
  i = 1;
  std::cout << "Get OpenCL.CPU devices in the system" << std::endl;
  for (const auto &dev : device::get_devices(info::device_type::cpu)) {
    std::cout << "Device " << i++ << " is available: " << get_type(dev)
              << std::endl;
  }
  i = 1;
  std::cout << "Get OpenCL.GPU devices in the system" << std::endl;
  for (const auto &dev : device::get_devices(info::device_type::gpu)) {
    std::cout << "Device " << i++ << " is available: " << get_type(dev)
              << std::endl;
  }
  i = 1;
  std::cout << "Get OpenCL.ACC devices in the system" << std::endl;
  for (const auto &dev : device::get_devices(info::device_type::accelerator)) {
    std::cout << "Device " << i++ << " is available: " << get_type(dev)
              << std::endl;
  }

  auto devices = device::get_devices();
  device &deviceA = devices[0];
  device &deviceB = (devices.size() > 1 ? devices[1] : devices[0]);
  {
    std::cout << "move constructor" << std::endl;
    device Device(deviceA);
    size_t hash = std::hash<device>()(Device);
    device MovedDevice(std::move(Device));
    assert(hash == std::hash<device>()(MovedDevice));
    assert(deviceA.is_host() == MovedDevice.is_host());
  }
  {
    std::cout << "move assignment operator" << std::endl;
    device Device(deviceA);
    size_t hash = std::hash<device>()(Device);
    device WillMovedDevice(deviceB);
    WillMovedDevice = std::move(Device);
    assert(hash == std::hash<device>()(WillMovedDevice));
    assert(deviceA.is_host() == WillMovedDevice.is_host());
  }
  {
    std::cout << "copy constructor" << std::endl;
    device Device(deviceA);
    size_t hash = std::hash<device>()(Device);
    device DeviceCopy(Device);
    assert(hash == std::hash<device>()(Device));
    assert(hash == std::hash<device>()(DeviceCopy));
    assert(Device == DeviceCopy);
    assert(Device.is_host() == DeviceCopy.is_host());
  }
  {
    std::cout << "copy assignment operator" << std::endl;
    device Device(deviceA);
    size_t hash = std::hash<device>()(Device);
    device WillDeviceCopy(deviceB);
    WillDeviceCopy = Device;
    assert(hash == std::hash<device>()(Device));
    assert(hash == std::hash<device>()(WillDeviceCopy));
    assert(Device == WillDeviceCopy);
    assert(Device.is_host() == WillDeviceCopy.is_host());
  }
}

